import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {SQLiteStore, DATABASE_NAME, backupDatabase} from '../lib/sqlite-store.js';
import {PlaybackEngine, migrateState} from '../lib/engine.js';
import {createApp} from '../lib/http.js';
import {queuePage,QUEUE_PAGE_SIZE} from '../public/assets/queue-page.js';

const videos=(count,offset=0)=>Array.from({length:count},(_,n)=>({
  id:`entry-${n+offset}`,videoId:String(n+offset).padStart(11,'0'),title:`Archive ${n+offset}`,
  position:0,duration:3600,paused:false,playCount:0
}));
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-sqlite-'));
  const stores=[];
  t.after(()=>{for(const s of stores)s.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {dir,open:()=>{const store=new SQLiteStore(dir);stores.push(store);return store;}};
}
function seed(engine,count) {
  const entries=videos(count);
  engine.state.current=entries[0];engine.state.queue=entries.slice(1);engine.save();
}

for(const count of [2501,10000])test(`SQLite imports and reloads ${count} entries without truncation`,t=>{
  const f=fixture(t),store=f.open(),engine=new PlaybackEngine(store);
  // Exercise the actual playlist import path and its safe per-request batches.
  for(let at=0;at<count;at+=500)engine.importPlaylist(videos(Math.min(500,count-at),at));
  engine.seek(612);engine.pause(true);engine.setAudio(37,true);
  engine.move(engine.state.queue.at(-1).id,'nextRotation');
  engine.move(engine.state.queue[100].id,'playNext');
  engine.move(engine.state.queue[200].id,'recycled');
  const expected=structuredClone(engine.state);
  assert.equal(engine.storedCount(),count);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM queue_entries').get().n,count-1);
  store.close();
  const reopened=f.open(),restored=new PlaybackEngine(reopened);
  assert.deepEqual(restored.state,expected);
  assert.equal(restored.state.current.position,612);
  assert.equal(restored.state.current.paused,true);
  assert.equal(restored.state.audio.volume,37);
  assert.equal(restored.storedCount(),count);
  assert.match(reopened.db.prepare('EXPLAIN QUERY PLAN SELECT id FROM queue_entries WHERE lane=? ORDER BY position LIMIT 50').get('queue').detail,/queue_lane_position/);
  assert.equal(reopened.db.prepare('PRAGMA journal_mode').get().journal_mode,'wal');
  assert.equal(reopened.db.prepare('PRAGMA synchronous').get().synchronous,2);
});

test('Legacy JSON migrates once with exact backup, all lanes, vote, IDs, order and playhead intact',t=>{
  const f=fixture(t),raw=migrateState(null);
  raw.current={...videos(1)[0],position:1234,paused:true};
  raw.queue=videos(3200,1);raw.priorityQueue=videos(80,3201);
  raw.recycledQueue=videos(2400,4000);raw.nextRotationQueue=videos(2300,7000);
  raw.rotationNumber=17;raw.audio={volume:42,muted:true};
  raw.settings.lowerThird.backgroundOpacity=42;raw.settings.lowerThird.height=15;
  raw.history=[{...raw.recycledQueue[0],reason:'completed'}];
  raw.suggestions=[{...videos(1,99999)[0],viewer:'private-voter'}];
  raw.vote={id:'round-1',remaining:13,choices:[raw.queue[0].id],ballots:{viewer1:0},manual:true,wasPaused:true};
  const bytes=JSON.stringify(raw,null,2)+'\n';
  fs.writeFileSync(path.join(f.dir,'state.json'),bytes);
  const store=f.open(),engine=new PlaybackEngine(store);
  assert.equal(engine.storedCount(),7981);
  for(const lane of ['queue','priorityQueue','recycledQueue','nextRotationQueue','history','suggestions'])assert.deepEqual(engine.state[lane],raw[lane]);
  assert.deepEqual(engine.state.current,raw.current);assert.deepEqual(engine.state.vote,raw.vote);
  assert.equal(engine.state.settings.lowerThird.height,15);
  assert.equal(fs.readFileSync(store.migrationBackup,'utf8'),bytes);
  assert.equal(fs.readFileSync(store.legacyFile,'utf8'),bytes,'original JSON is never overwritten');
  engine.cancelVote();engine.seek(2000);store.close();
  // A stale legacy file cannot overwrite a committed SQLite library.
  fs.writeFileSync(path.join(f.dir,'state.json'),JSON.stringify(migrateState(null)));
  const restored=new PlaybackEngine(f.open());
  assert.equal(restored.state.current.position,2000);assert.equal(restored.state.queue.length,3200);
  assert.equal(restored.state.vote,null);assert.equal(restored.state.rotationNumber,17);
});

test('Runtime checkpoints with 10,000 videos never traverse or rewrite catalog arrays',t=>{
  const f=fixture(t),store=f.open(),engine=new PlaybackEngine(store);seed(engine,10000);
  const original=engine.state.queue;
  Object.defineProperty(engine.state,'queue',{enumerable:true,configurable:true,get(){throw new Error('Checkpoint scanned the queue');}});
  try {
    for(let i=1;i<=10;i++)engine.updatePosition(engine.state.generation,i*2,3600);
    engine.setAudio(21,true);engine.seek(900);engine.pause(true);
    assert.equal(store.lastWrite.catalogRowsChanged,0);
    assert.equal(store.lastWrite.catalogChanged,false);
    assert.ok(store.lastWrite.serializedBytes<8000);
  } finally {Object.defineProperty(engine.state,'queue',{enumerable:true,configurable:true,writable:true,value:original});}
  store.close();const restored=new PlaybackEngine(f.open());
  assert.equal(restored.state.current.position,900);assert.equal(restored.state.current.paused,true);
  assert.equal(restored.state.queue.length,9999);
});

test('Completing one video persists only changed rows, not shifted positions for every queued video',t=>{
  const f=fixture(t),store=f.open(),engine=new PlaybackEngine(store);seed(engine,5000);
  engine.skip();
  assert.ok(store.lastWrite.catalogRowsChanged<=4,JSON.stringify(store.lastWrite));
  assert.equal(engine.state.current.videoId,'00000000001');
  assert.equal(engine.state.recycledQueue.length,1);
  const expected=structuredClone(engine.state);store.close();assert.deepEqual(new PlaybackEngine(f.open()).state,expected);
});

test('A failed SQLite commit rolls back runtime and queue mutation together',t=>{
  const f=fixture(t),store=f.open(),engine=new PlaybackEngine(store);seed(engine,3000);
  const before=structuredClone(engine.state);
  store.db.exec("CREATE TEMP TRIGGER fail_commit BEFORE UPDATE ON station_state BEGIN SELECT RAISE(ABORT, 'injected disk failure'); END");
  assert.throws(()=>engine.move('entry-2400','nextRotation'),/Could not persist state/);
  assert.deepEqual(engine.state,before);
  assert.equal(store.db.prepare("SELECT lane FROM queue_entries WHERE id='entry-2400'").get().lane,'queue');
  store.db.exec('DROP TRIGGER fail_commit');
  engine.move('entry-2400','nextRotation');store.close();
  assert.equal(new PlaybackEngine(f.open()).state.nextRotationQueue[0].id,'entry-2400');
});

test('Corrupt JSON, duplicate identities and newer schemas fail safely instead of starting an empty library',t=>{
  const f=fixture(t);
  fs.writeFileSync(path.join(f.dir,'state.json'),'{broken');
  const store=f.open();assert.throws(()=>new PlaybackEngine(store),/Cannot migrate/);
  assert.equal(store.sql.readState.get(),undefined);
  const raw=migrateState(null);raw.queue=[...videos(1),...videos(1)];
  fs.writeFileSync(store.legacyFile,JSON.stringify(raw));
  assert.throws(()=>new PlaybackEngine(store),/Duplicate queue-entry/);
  assert.equal(store.sql.readState.get(),undefined);
  assert.equal(JSON.parse(fs.readFileSync(store.legacyFile)).queue.length,2);
  assert.throws(()=>migrateState({schemaVersion:999}),/newer Playback/);
  store.close();
  const db=new DatabaseSync(path.join(f.dir,DATABASE_NAME));db.exec('PRAGMA user_version=999');db.close();
  assert.throws(()=>new SQLiteStore(f.dir),/newer/);
});

test('Live database backup includes committed WAL state and refuses overwriting an existing backup',t=>{
  const f=fixture(t),store=f.open(),engine=new PlaybackEngine(store);seed(engine,5000);engine.seek(777);
  const dest=path.join(f.dir,'backups','snapshot.sqlite3');
  assert.equal(backupDatabase(store.file,dest),dest);
  assert.throws(()=>backupDatabase(store.file,dest),/already exists/);
  const db=new DatabaseSync(dest,{readOnly:true});
  try {
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM queue_entries').get().n,4999);
    assert.equal(JSON.parse(db.prepare('SELECT data FROM station_state').get().data).current.position,777);
  } finally {db.close();}
  assert.equal(engine.state.queue.length,4999);
});

test('A process killed without cleanup recovers its last committed SQLite checkpoint and queue', {timeout:20000},async t=>{
  const f=fixture(t);
  const moduleStore=new URL('../lib/sqlite-store.js',import.meta.url).href;
  const moduleEngine=new URL('../lib/engine.js',import.meta.url).href;
  const script=`import {SQLiteStore} from ${JSON.stringify(moduleStore)};import {PlaybackEngine} from ${JSON.stringify(moduleEngine)};
    const s=new SQLiteStore(${JSON.stringify(f.dir)}),e=new PlaybackEngine(s);
    e.state.queue=Array.from({length:3000},(_,i)=>({id:'crash-'+i,videoId:String(i).padStart(11,'0'),title:'Video '+i,duration:3600}));
    e.activateAt();e.save();e.seek(456);e.setAudio(27,true);e.pause(true);process.send('committed');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['ignore','pipe','pipe','ipc']});
  let errors='';child.stderr.on('data',d=>errors+=d);
  t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
  const ready=await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw new Error(errors||'Child failed before checkpoint');})]);
  assert.equal(ready[0],'committed');const exit=once(child,'exit');child.kill('SIGKILL');await exit;
  const restored=new PlaybackEngine(f.open());
  assert.equal(restored.state.queue.length,2999);assert.equal(restored.state.current.id,'crash-0');
  assert.equal(restored.state.current.position,456);assert.equal(restored.state.current.paused,true);
  assert.deepEqual(restored.state.audio,{volume:27,muted:true});
});

test('Real HTTP backend accepts more than 2,000 videos and preserves controls, paging and small polls',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-large-http-'));let app;
  t.after(async()=>{if(app)await app.close();fs.rmSync(dir,{recursive:true,force:true});});
  const make=async()=>{
    app=createApp({dataDir:dir,port:0,twitchEnabled:false,titleResolver:async()=>null,env:{ADMIN_TOKEN:'storage-test'}});
    const {port}=await app.listen();return `http://127.0.0.1:${port}/api`;
  };
  let base=await make();
  const login=async()=>{const r=await fetch(`${base}/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'storage-test'})});return r.headers.get('set-cookie').split(';')[0];};
  let cookie=await login();
  const post=async(action,data={})=>{const r=await fetch(`${base}/control`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({action,...data})});assert.equal(r.status,200,await r.clone().text());return r.json();};
  for(let offset=0;offset<3000;offset+=300)await post('bulk',{lines:videos(300,offset).map(v=>({url:v.videoId,title:v.title}))});
  assert.equal(app.engine.storedCount(),3000);
  await post('add',{url:'zzzzzzzzzzz',title:'Beyond the old limit',destination:'nextRotation'});
  await post('seek',{position:321});await post('audio',{volume:34,muted:true});
  const first=await(await fetch(`${base}/operator?compact=1`,{headers:{Cookie:cookie}})).json();
  assert.equal(first.catalog.upcomingQueue.length,2999);
  const found=queuePage(first.catalog.upcomingQueue,0,'Archive 2999');
  assert.equal(found.items.length,1);assert.equal(found.items[0].index,2998);
  assert.equal(queuePage(first.catalog.upcomingQueue,30).items.length,QUEUE_PAGE_SIZE);
  const delta=await(await fetch(`${base}/operator?compact=1&catalog=${encodeURIComponent(first.catalogRevision)}`,{headers:{Cookie:cookie}})).text();
  assert.ok(Buffer.byteLength(delta)<8000);assert.equal(JSON.parse(delta).catalog,undefined);
  const health=await(await fetch(`${base}/health`)).json();assert.equal(health.storage,'sqlite');assert.equal(health.queueLimit,null);
  await app.close();base=await make();
  assert.deepEqual(await (await fetch(`${base}/session`,{headers:{Cookie:cookie}})).json(),{authenticated:true});
  assert.equal(app.engine.storedCount(),3001);assert.equal(app.engine.state.current.position,321);
  assert.deepEqual(app.engine.state.audio,{volume:34,muted:true});
});

test('Large reorders, bulk moves and shuffle reload in exact lane order',t=>{
  const f=fixture(t),store=f.open(),engine=new PlaybackEngine(store);seed(engine,3000);
  engine.reorder('entry-2900',1);engine.reorder('entry-1',2000);
  const selected=engine.state.queue.slice(100,600).map(v=>v.id);
  engine.moveMany(selected,'nextRotation');engine.move(selected[10],'playNext');
  engine.sortUpcoming('shuffle');engine.playNow(engine.state.queue.at(-1).id);engine.skip();
  const expected=structuredClone(engine.state);store.close();
  assert.deepEqual(new PlaybackEngine(f.open()).state,expected);
});

test('Interrupted first migration commits no partial catalog and can be retried from unchanged JSON',t=>{
  const f=fixture(t),raw=migrateState(null);raw.queue=videos(2500);
  const bytes=JSON.stringify(raw);fs.writeFileSync(path.join(f.dir,'state.json'),bytes);
  const store=f.open();
  store.db.exec("CREATE TEMP TRIGGER fail_import BEFORE INSERT ON station_state BEGIN SELECT RAISE(ABORT, 'injected migration failure'); END");
  assert.throws(()=>new PlaybackEngine(store),/Could not persist state/);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM queue_entries').get().n,0);
  assert.equal(store.sql.readState.get(),undefined);
  assert.equal(fs.readFileSync(store.migrationBackup,'utf8'),bytes);
  assert.equal(fs.readFileSync(store.legacyFile,'utf8'),bytes);
  store.db.exec('DROP TRIGGER fail_import');
  assert.equal(new PlaybackEngine(store).state.queue.length,2500);
});

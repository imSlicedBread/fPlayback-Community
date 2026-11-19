import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {privateSecret} from '../lib/store.js';
import {SQLiteStore} from '../lib/sqlite-store.js';
import {PlaybackEngine} from '../lib/engine.js';
import {createApp} from '../lib/http.js';

function directory(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'station-recovery-'));
  t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));
  return dir;
}

test('generated credentials survive restart and invalid files require explicit recovery',t=>{
  const dir=directory(t),file=path.join(dir,'key');
  const original=privateSecret(dir,'key',24);
  assert.match(original,/^[a-f0-9]{48}$/);
  assert.equal(privateSecret(dir,'key',24),original);
  for(const damaged of ['', '  ', original.slice(1), 'x'.repeat(48)]){
    fs.writeFileSync(file,damaged);
    assert.throws(()=>privateSecret(dir,'key',24),/Invalid credential file key/);
    assert.equal(fs.readFileSync(file,'utf8'),damaged);
  }
});

test('Previous on a single looping entry and legacy recovery preserve distinct occurrence IDs',t=>{
  const dir=directory(t),store=new SQLiteStore(dir);
  try {
    const engine=new PlaybackEngine(store);
    const first=engine.add('aaaaaaaaaaa','First');
    engine.skip();engine.previous();
    assert.equal(engine.state.current.id,first.id);
    assert.equal(engine.queuedCount(),0);
    const second=engine.add('aaaaaaaaaaa','Second',{destination:'playNext'});
    engine.state.priorityQueue.unshift({...engine.state.current});
    engine.save();
    const recovered=new PlaybackEngine(store);
    assert.deepEqual(recovered.state.priorityQueue.map(row=>row.id),[second.id]);
    assert.deepEqual(store.load().priorityQueue.map(row=>row.id),[second.id]);
    assert.equal(store.load().current.id,first.id);
  } finally {store.close();}
});

test('bulk admission looks up existing titles once per batch',t=>{
  const engine=new PlaybackEngine();
  engine.add('aaaaaaaaaaa','First');
  engine.add('aaaaaaaaaaa','Later');
  const scan=t.mock.method(engine,'allEntries');
  engine.bulkAdd(['aaaaaaaaaaa','aaaaaaaaaaa','aaaaaaaaaaa | Custom']);
  assert.deepEqual(engine.state.queue.slice(-3).map(row=>row.title),['First','First','Custom']);
  assert.equal(scan.mock.callCount(),1);
  engine.importPlaylist([{videoId:'aaaaaaaaaaa'},{videoId:'aaaaaaaaaaa'}],{skipDuplicates:false});
  assert.equal(scan.mock.callCount(),2);
});

test('a failed timer checkpoint degrades health and the next durable tick concludes once',async t=>{
  const dir=directory(t);
  let now=100_000;
  const app=createApp({dataDir:dir,port:0,clock:()=>now,chatEnabled:false,titleResolver:async()=>null});
  try {
    const address=await app.listen();
    const health=()=>fetch(`http://127.0.0.1:${address.port}/api/health`);
    const engine=app.engine;
    engine.add('aaaaaaaaaaa','First');
    const winner=engine.add('bbbbbbbbbbb','Second');
    engine.startVote();
    const original=structuredClone(engine.state.vote);
    engine.store.db.exec('PRAGMA query_only=ON');
    now+=1000*original.remaining;
    await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal((await health()).status,503);
    assert.deepEqual(engine.state.vote,original);
    engine.store.db.exec('PRAGMA query_only=OFF');
    now+=1000;
    await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal((await health()).status,200);
    assert.equal(engine.state.vote,null);
    assert.equal(engine.store.load().current.id,winner.id);
    const generation=engine.state.generation;
    now+=1000;engine.tick();
    assert.equal(engine.state.generation,generation);
  } finally {await app.close();}
});

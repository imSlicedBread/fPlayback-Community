import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {processLock} from '../lib/store.js';
import {createApp} from '../lib/http.js';

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'playback-lock-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return {dir,file:path.join(dir,'.instance.lock')};
}

test('Windows EPERM preserves the existing lock and explains automatic startup',t=>{
  const {dir,file}=fixture(t);
  fs.writeFileSync(file,'12345');
  t.mock.method(process,'kill',(pid,signal)=>{
    assert.equal(pid,12345);assert.equal(signal,0);
    throw Object.assign(new Error('kill EPERM'),{code:'EPERM'});
  });
  assert.throws(()=>processLock(dir),error=>{
    assert.equal(error.code,'PLAYBACK_INSTANCE_LOCKED');
    assert.match(error.message,/Windows denied the process check/);
    assert.match(error.message,/automatic startup/);
    return true;
  });
  assert.equal(fs.readFileSync(file,'utf8'),'12345');
});

test('a live instance is protected while a definitively exited PID can be reclaimed',t=>{
  const {dir,file}=fixture(t);
  const release=processLock(dir);
  assert.throws(()=>processLock(dir),{code:'PLAYBACK_INSTANCE_LOCKED'});
  release();
  fs.writeFileSync(file,'12345');
  t.mock.method(process,'kill',()=>{throw Object.assign(new Error('gone'),{code:'ESRCH'});});
  const releaseNew=processLock(dir);
  assert.equal(fs.readFileSync(file,'utf8'),String(process.pid));
  releaseNew();
  assert.equal(fs.existsSync(file),false);
});

test('unexpected probe failures never discard the lock',t=>{
  const {dir,file}=fixture(t);
  fs.writeFileSync(file,'12345');
  t.mock.method(process,'kill',()=>{throw Object.assign(new Error('unexpected'),{code:'EIO'});});
  assert.throws(()=>processLock(dir),{code:'EIO'});
  assert.equal(fs.readFileSync(file,'utf8'),'12345');
});

for(const interactive of [false,true])test(`duplicate ${interactive?'interactive':'background'} launch preserves the running station`,{
  skip:interactive&&process.platform!=='linux'?'headless browser suppression requires Linux':false
},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'playback-duplicate-'));
  const file=path.join(dir,'.instance.lock');
  const app=createApp({dataDir:dir,port:0,chatEnabled:false,titleResolver:async()=>null});
  await app.listen();
  t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
  const port=app.server.address().port;
  const lock=fs.readFileSync(file,'utf8');
  const child=spawn(process.execPath,['server.js'],{
    cwd:new URL('..',import.meta.url),
    env:{...process.env,PORT:String(port),DATA_DIR:dir,PB_OPEN_BROWSER:interactive?'1':'0',DISPLAY:'',WAYLAND_DISPLAY:''},
    windowsHide:true,stdio:['ignore','pipe','pipe']
  });
  // Interactive mode runs only on headless Linux; browser commands are mocked
  // separately in open-dashboard.test.js on every platform.
  let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  t.after(()=>{if(child.exitCode===null)child.kill();});
  const [code]=await once(child,'close');
  assert.equal(code,interactive?0:1,output);
  assert.match(output,interactive?/already running/:/Failed to start:.*automatic startup/);
  assert.doesNotMatch(output,/node:internal|Error: kill/);
  assert.equal(fs.readFileSync(file,'utf8'),lock);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).ok,true);
});

test('simultaneous starters recover a crashed owner exactly once', {timeout:15_000}, async t=>{
  const {dir,file}=fixture(t);
  const exited=spawn(process.execPath,['-e',''],{windowsHide:true});
  await once(exited,'close');
  fs.writeFileSync(file,String(exited.pid));
  const moduleUrl=new URL('../lib/store.js',import.meta.url).href;
  const source=`
    import {processLock,privateSecret} from ${JSON.stringify(moduleUrl)};
    import {createHash} from 'node:crypto';
    let release;
    process.on('message',message=>{
      if(message==='initialize'){
        const key=privateSecret(process.argv[1],'test-key',24);
        process.send(createHash('sha256').update(key).digest('hex'));
      } else if(message==='start'){
        try {release=processLock(process.argv[1]);process.send('owner');}
        catch(error){process.send(error.code);}
      } else {release?.();process.disconnect();}
    });
    process.send('ready');
  `;
  const children=[];
  try {
    const ready=[];
    for(let i=0;i<4;i++){
      const child=spawn(process.execPath,['--input-type=module','-e',source,dir],{
        windowsHide:true,stdio:['ignore','ignore','inherit','ipc']
      });
      children.push(child);ready.push(once(child,'message'));
    }
    await Promise.all(ready);
    const fingerprints=await Promise.all(children.map(child=>{
      const response=once(child,'message');child.send('initialize');return response;
    }));
    assert.equal(new Set(fingerprints.map(([value])=>value)).size,1);
    const outcomes=await Promise.all(children.map(child=>{
      const outcome=once(child,'message');child.send('start');return outcome;
    }));
    assert.deepEqual(outcomes.map(([result])=>result).sort(),['PLAYBACK_INSTANCE_LOCKED','PLAYBACK_INSTANCE_LOCKED','PLAYBACK_INSTANCE_LOCKED','owner']);
    const winner=children[outcomes.findIndex(([result])=>result==='owner')];
    assert.equal(fs.readFileSync(file,'utf8'),String(winner.pid));
    await Promise.all(children.map(child=>{const closed=once(child,'close');child.send('stop');return closed;}));
  } finally {for(const child of children)if(child.exitCode===null)child.kill();}
});

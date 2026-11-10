import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../lib/http.js';
import {extractWithYtDlp,parsePlaylistUrl} from '../lib/playlist-import.js';
const options=dataDir=>({dataDir,port:0,twitchEnabled:false,chatEnabled:false,titleResolver:async()=>null});
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};

test('Control shutdown confirms before sending, stops polling on success and permits retry on failure', async () => {
  const source = fs.readFileSync(new URL('../public/assets/control.js', import.meta.url), 'utf8');
  const handler = source.slice(source.indexOf("$('shutdown').addEventListener("), source.indexOf('await initAuth(refresh);'));
  const makePage = ({confirmed = true, error} = {}) => {
    const nodes = new Map();
    const get = id => {
      if (!nodes.has(id)) nodes.set(id, {
        disabled: false,
        hidden: true,
        addEventListener(_event, callback) { this.click = callback; },
        classList: {remove() { get(id).hidden = false; }},
      });
      return nodes.get(id);
    };
    const calls = [], cleared = [], notices = [], main = {inert: false};
    let polls = 0;
    vm.runInNewContext('let shuttingDown=false,pollTimer=1,audioTimer=2;\n' + handler, {
      $: get,
      window: {confirm: () => confirmed},
      document: {querySelector: () => main},
      api: async (route, options) => {
        calls.push({route, options});
        if (error) throw error;
        return {ok: true};
      },
      AbortSignal,
      clearTimeout: id => cleared.push(id),
      showNotice: (...args) => notices.push(args),
      schedulePoll: () => { polls++; },
    });
    return {get, calls, cleared, notices, main, pollCount: () => polls};
  };
  const cancelled = makePage({confirmed: false});
  await cancelled.get('shutdown').click();
  assert.equal(cancelled.calls.length, 0);
  assert.equal(cancelled.get('shutdown').disabled, false);

  const stopped = makePage();
  await stopped.get('shutdown').click();
  await stopped.get('shutdown').click();
  assert.equal(stopped.calls.length, 1);
  assert.equal(stopped.calls[0].route, 'shutdown');
  assert.equal(stopped.calls[0].options.method, 'POST');
  assert.equal(stopped.calls[0].options.data.confirm, true);
  assert.deepEqual(stopped.cleared, [1, 2]);
  assert.equal(stopped.get('shutdownNotice').hidden, false);
  assert.equal(stopped.main.inert, true);

  const denied = makePage({error: Object.assign(new Error('Operator login required'), {status: 401})});
  await denied.get('shutdown').click();
  assert.equal(denied.get('shutdown').disabled, false);
  assert.equal(denied.get('auth').hidden, false);
  assert.equal(denied.pollCount(), 1);
  assert.equal(denied.notices[0][1], 'Operator login required');
});

test('Control shutdown requires operator confirmation and lets the station exit successfully with its queue saved', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playback-control-shutdown-'));
  const initial = createApp(options(dir));
  initial.engine.add('dQw4w9WgXcQ', 'Saved playback');
  initial.engine.add('jNQXAC9IVRw', 'Next in queue');
  initial.engine.seek(120);
  const currentId = initial.engine.state.current.id;
  const nextId = initial.engine.state.queue[0].id;
  await initial.close();
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], {
    windowsHide: true,
    env: {...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dir, ADMIN_TOKEN: 'shutdown-test', PB_OPEN_BROWSER: '0'},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'close');
  let errors = '', output = '', readyTimer;
  child.stderr.on('data', chunk => { errors += chunk; });
  t.after(async () => {
    clearTimeout(readyTimer);
    if (child.exitCode === null) child.kill();
    await exited;
    fs.rmSync(dir, {recursive: true, force: true});
  });
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/Dashboard: http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(readyTimer); resolve(Number(match[1])); }
    });
    child.once('exit', () => reject(new Error('Station exited before startup: ' + errors)));
    readyTimer = setTimeout(() => reject(new Error('Station startup timed out: ' + errors)), 8000);
  });
  const base = 'http://127.0.0.1:' + port;
  const post = (data, cookie = '', origin) => fetch(base + '/api/shutdown', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Cookie: cookie, ...(origin ? {Origin: origin} : {})},
    body: JSON.stringify(data),
  });
  assert.equal((await post({confirm: true})).status, 401);
  const login = await fetch(base + '/api/login', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: 'shutdown-test'}),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await post({confirm: true}, cookie, 'https://other.example')).status, 403);
  assert.equal((await post({}, cookie)).status, 400);
  assert.equal((await fetch(base + '/api/shutdown', {headers: {Cookie: cookie}})).status, 404);
  assert.equal((await fetch(base + '/api/health')).status, 200);
  const response = await post({confirm: true}, cookie, base);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {ok: true});
  let exitTimer;
  try {
    const [code, signal] = await Promise.race([
      exited,
      new Promise((_, reject) => { exitTimer = setTimeout(() => reject(new Error('Station stayed alive: ' + errors)), 4000); }),
    ]);
    assert.equal(code, 0, errors);
    assert.equal(signal, null);
  } finally {
    clearTimeout(exitTimer);
  }
  assert.equal(fs.existsSync(path.join(dir, '.instance.lock')), false);
  const reopened = createApp(options(dir));
  try {
    assert.equal(reopened.engine.state.current.id, currentId);
    assert.equal(reopened.engine.state.current.position, 120);
    assert.equal(reopened.engine.state.queue[0].id, nextId);
  } finally {
    await reopened.close();
  }
});

test('shutdown drains stalled HTTP requests within its deadline and releases the station lock exactly once',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'playback-shutdown-'));
 const app=createApp(options(dir));await app.listen();
 t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
 const socket=net.connect(app.server.address().port,'127.0.0.1');socket.on('error',()=>{});
 await once(socket,'connect');
 socket.write('POST /api/login HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{');
 await delay(30);
 const began=Date.now(),first=app.close();assert.equal(app.close(),first);
 await first;assert.ok(Date.now()-began<3000);assert.equal(app.server.listening,false);
 app.cleanup();app.cleanup();
 assert.equal(fs.existsSync(path.join(dir,'.instance.lock')),false);
 const reopened=createApp(options(dir));await reopened.listen();await reopened.close();
 socket.destroy();
});

test('shutdown aborts active extraction before waiting for HTTP connections to close',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'playback-extract-close-'));
 let started,aborted=false;const ready=new Promise(resolve=>{started=resolve;});
 const app=createApp({...options(dir),env:{ADMIN_TOKEN:'shutdown-test'},playlistExtractor:(_url,{signal})=>new Promise((_,reject)=>{
  signal.addEventListener('abort',()=>{aborted=true;reject(new Error('cancelled'));},{once:true});started();
 })});await app.listen();const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'shutdown-test'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];await login.json();
 const response=fetch(base+'/api/playlist/extract',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({url:'https://www.youtube.com/playlist?list=PL0123456789abcdefghijklmnop'})}).catch(()=>null);
 await ready;await app.close();assert.equal(aborted,true);await response;
});

test('cancelled extraction waits for its child process tree to close without killing unrelated processes',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'playback-child-cleanup-'));
 const readyFile=path.join(dir,'ready.json');let child,descendant;
 const unrelated=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
 t.after(()=>{for(const pid of [child?.pid,descendant,unrelated.pid])if(pid&&alive(pid))try{process.kill(pid,'SIGKILL');}catch{}fs.rmSync(dir,{recursive:true,force:true});});
 const script=`const {spawn}=require('node:child_process');const fs=require('node:fs');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});fs.writeFileSync(process.argv[1],JSON.stringify({pid:process.pid,child:c.pid}));setInterval(()=>{},1000);`;
 const controller=new AbortController();
 const extraction=extractWithYtDlp(parsePlaylistUrl('https://www.youtube.com/playlist?list=PL0123456789abcdefghijklmnop'),{start:1,limit:1,signal:controller.signal,
  spawnImpl:(_cmd,_args,opts)=>(child=spawn(process.execPath,['-e',script,readyFile],opts))});
 const rejection=assert.rejects(extraction,/cancelled/i);
 for(let i=0;i<150&&!fs.existsSync(readyFile);i++)await delay(20);
 assert.ok(fs.existsSync(readyFile),'child tree started');descendant=JSON.parse(fs.readFileSync(readyFile,'utf8')).child;
 controller.abort();await rejection;
 for(let i=0;i<100&&(alive(child.pid)||alive(descendant));i++)await delay(20);
 assert.equal(alive(child.pid),false);assert.equal(alive(descendant),false);assert.equal(alive(unrelated.pid),true);
});

test('already-cancelled extraction never launches a process',async()=>{
 const controller=new AbortController();controller.abort();let launched=false;
 await assert.rejects(extractWithYtDlp(parsePlaylistUrl('https://www.youtube.com/playlist?list=PL0123456789abcdefghijklmnop'),{start:1,limit:1,signal:controller.signal,spawnImpl:()=>{launched=true;}}),/cancelled/i);
 assert.equal(launched,false);
});

test('a station process exits naturally after shutdown with a stalled client, without forced termination',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'playback-exit-'));
 const moduleUrl=new URL('../lib/http.js',import.meta.url).href;
 const script=`import {createApp} from ${JSON.stringify(moduleUrl)};const app=createApp({dataDir:${JSON.stringify(dir)},port:0,twitchEnabled:false,chatEnabled:false,titleResolver:async()=>null});await app.listen();process.on('message',async()=>{await app.close();process.disconnect();});process.send({port:app.server.address().port});`;
 const child=spawn(process.execPath,['--input-type=module','-e',script],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
 let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
 t.after(()=>{if(alive(child.pid))child.kill('SIGKILL');fs.rmSync(dir,{recursive:true,force:true});});
 const [{port}]=await once(child,'message');
 const socket=net.connect(port,'127.0.0.1');socket.on('error',()=>{});await once(socket,'connect');
 socket.write('POST /api/login HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{');await delay(30);
 const exited=once(child,'close');let timer;
 child.send('stop');
 try {
  const [code,signal]=await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Station did not exit naturally: '+errors)),4000);})]);
  assert.equal(code,0,errors);assert.equal(signal,null);assert.equal(alive(child.pid),false);
 } finally {clearTimeout(timer);socket.destroy();}
});

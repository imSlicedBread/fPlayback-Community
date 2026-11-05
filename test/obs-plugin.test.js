import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../lib/http.js';
const source=fs.readFileSync(new URL('../obs-plugin/watch-controller.js',import.meta.url),'utf8');
function harness(){
 const style=()=>({values:{},priorities:{},setProperty(name,value,priority=''){this.values[name]=value;this.priorities[name]=priority;},
  getPropertyValue(name){return this.values[name]||'';},getPropertyPriority(name){return this.priorities[name]||'';},removeProperty(name){delete this.values[name];delete this.priorities[name];}});
 const listeners=new Map();
 let smallLayout=false;
 const rect=()=>({left:0,top:0,width:smallLayout?640:1280,height:smallLayout?360:720});
 const video={style:style(),videoWidth:1280,videoHeight:720,getBoundingClientRect:rect,readyState:4,duration:240,currentTime:0,paused:true,ended:false,volume:1,muted:false,
  addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);},
  pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();}};
 const player={style:style(),getBoundingClientRect:rect,classList:{contains:()=>ad}};
 const document={title:'YouTube',documentElement:{style:style()},body:{style:style(),appendChild(node){node.parentElement=this;}},
  querySelector(selector){if(selector==='video.html5-main-video')return video;if(selector==='#movie_player')return player;return barrier?{getClientRects:()=>[{}],textContent:'Access required'}:null;}};
 const promo={style:style(),textContent:'YouTube Premium Get YouTube without the ads No thanks 1 month free',
  getClientRects(){return this.style.getPropertyValue('display')==='none'?[]:[{}];}};
 let promotion=false,playerError=false;
 const transientError={matches:selector=>selector==='.ytp-error-content-wrap',getClientRects:()=>[{}],textContent:'An error occurred. Please try again later. (Playback ID: example) Learn More'};
 const controls=[{style:style()},{style:style()}];
 const watermark={style:style()};
 document.querySelectorAll=selector=>selector.startsWith('.ytp-chrome-bottom')?[...controls,...(selector.includes('.ytp-watermark')?[watermark]:[])]:
   [...(promotion?[promo]:[]),...(barrier?[{getClientRects:()=>[{}],textContent:'Confirmation required'}]:[]),...(playerError?[transientError]:[])];
 let ad=false,barrier=false,now=0;
 const frames=new Map(),observers=new Set();let frameId=0;
 const context={window:{innerWidth:1280,innerHeight:720},document,URL,performance:{now:()=>now},location:new URL('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
  requestAnimationFrame(cb){frames.set(++frameId,cb);return frameId;},cancelAnimationFrame(id){frames.delete(id);},
  MutationObserver:class{constructor(cb){this.cb=cb;observers.add(cb);}observe(){}disconnect(){observers.delete(this.cb);}}};
 const defaults={nonce:'nonce',generation:1,videoId:'dQw4w9WgXcQ',position:35,volume:70,muted:false,paused:false,voting:false};
 return {video,player,controls,watermark,promo,context,listeners,setPlayerError(value){playerError=value;},setPromotion(value){promotion=value;},frame(ms=0){now+=ms;const pending=[...frames.values()];frames.clear();for(const cb of pending)cb();},setSmallLayout(value){smallLayout=value;for(const cb of observers)cb();},advance(ms){now+=ms;},setAd(value){ad=value;},setBarrier(value){barrier=value;},run(fields={}){
  document.title='YouTube';vm.runInNewContext(source.replace('__PLAYBACK_COMMAND__',JSON.stringify({...defaults,...fields})),context);
  return document.title.startsWith('fPlayback:')?JSON.parse(document.title.slice('fPlayback:nonce:'.length)):null;
 }};
}

test('watch-page quality prefers 1080p, retries boundedly and leaves queue/audio controls intact',()=>{
 const h=harness(),calls=[];
 h.player.getAvailableQualityLevels=()=>['medium','hd2160','hd720','hd1080'];
 h.player.getPlaybackQuality=()=> 'medium';
 h.player.setPlaybackQualityRange=(...args)=>calls.push(['range',...args]);
 h.player.setPlaybackQuality=value=>calls.push(['quality',value]);
 const report=h.run();
 assert.equal(JSON.stringify(calls),JSON.stringify([['range','hd1080','hd1080'],['quality','hd1080']]));
 assert.equal(report.qualityRequested,'hd1080');assert.equal(report.videoHeight,720);
 assert.equal(h.video.currentTime,35);assert.equal(h.video.volume,.7);assert.equal(h.video.paused,false);
 h.advance(1000);h.run();assert.equal(calls.length,2);
 h.advance(14000);h.run();assert.equal(calls.length,4);
 h.advance(15000);h.run({interacting:true});assert.equal(calls.length,4);
 h.run({paused:true});assert.equal(h.video.paused,true);assert.equal(h.video.currentTime,35);
});

test('quality follows available lower levels and late metadata without touching ads or access prompts',()=>{
 const h=harness(),calls=[];let levels=[];
 h.player.getAvailableQualityLevels=()=>levels;
 h.player.setPlaybackQuality=value=>calls.push(value);
 h.run();assert.equal(calls.length,0);
 levels=['small','large','hd720'];h.advance(5000);h.run();assert.equal(calls[0],'hd720');
 levels=['hd1080','hd720'];h.advance(15000);h.run();assert.equal(calls[1],'hd1080');
 h.setAd(true);h.advance(15000);h.run();assert.equal(calls.length,2);
 h.setAd(false);h.setBarrier(true);h.run();assert.equal(calls.length,2);
});

test('missing, throwing or unsupported watch-page quality APIs do not break playback',()=>{
 for(const kind of ['missing','throws','unsupported','setter-throws']) {
  const h=harness();
  if(kind==='throws')h.player.getAvailableQualityLevels=()=>{throw Error('changed API');};
  if(kind==='unsupported')h.player.getAvailableQualityLevels=()=>['auto','unknown'];
  if(kind==='setter-throws'){
   h.player.getAvailableQualityLevels=()=>['hd1080'];
   h.player.setPlaybackQualityRange=()=>{throw Error('not ready');};
   h.player.setPlaybackQuality=()=>{throw Error('not ready');};
  }
  const report=h.run();assert.equal(report.position,35);assert.equal(report.status,'Playing');assert.equal(report.qualityRequested,undefined);
 }
});

test('Premium marketing popups cannot hold locked playback in the normal YouTube layout',()=>{
 const h=harness();h.run({locked:true});h.advance(5000);h.video.currentTime=40;
 h.setPromotion(true);const report=h.run({locked:true});
 assert.equal(h.promo.style.getPropertyValue('display'),'none');assert.equal(report.status,'Playing');
 assert.equal(h.video.currentTime,40);assert.equal(h.player.style.getPropertyValue('width'),'100vw');
 h.run({locked:false});assert.equal(h.promo.style.getPropertyValue('display'),'');
 h.run({locked:true});h.setBarrier(true);
 assert.match(h.run({locked:true}).status,/attention/);
});

test('request-blocking failures are reported without adding an ad mask or overwriting the queue position',()=>{
 const h=harness();h.run({blockAdRequests:true});h.setAd(true);
 const report=h.run({blockAdRequests:true});assert.match(report.status,/filtering needs attention/);
 assert.equal(report.revealDisplay,true);assert.equal(report.position,undefined);
});

test('Ad Guard mutes detected ads, holds the checkpoint and restores saved audio for content',()=>{
 const h=harness();h.run({suppressAdOutput:true,volume:65});
 h.setAd(true);h.video.currentTime=8;
 const ad=h.run({suppressAdOutput:true,volume:65});
 assert.equal(ad.advertisement,true);assert.equal(ad.displayReady,false);assert.equal(ad.revealDisplay,false);
 assert.equal(ad.position,undefined);assert.equal(ad.ended,undefined);assert.equal(h.video.muted,true);
 h.video.muted=false;h.listeners.get('volumechange')();assert.equal(h.video.muted,true);
 h.setAd(false);const content=h.run({suppressAdOutput:true,volume:65});
 assert.equal(content.advertisement,false);assert.equal(h.video.currentTime,35);
 assert.equal(h.video.muted,false);assert.equal(h.video.volume,.65);
});

test('Ad Guard keeps long ads hidden and does not report ad completion or watchdog recovery',()=>{
 const h=harness();h.run({suppressAdOutput:true});h.setAd(true);
 h.video.currentTime=240;h.video.ended=true;
 h.advance(120000);h.frame();
 const ad=h.run({suppressAdOutput:true});
 assert.equal(ad.displayReady,false);assert.equal(ad.revealDisplay,false);
 assert.equal(ad.recover,undefined);assert.equal(ad.ended,undefined);assert.equal(ad.position,undefined);
 h.context.document.title='unchanged';h.listeners.get('ended')();
 assert.equal(h.context.document.title,'unchanged');
});

test('Ad Guard opt-out reveals ads and restores audio without changing the queue checkpoint',()=>{
 const h=harness();h.run({suppressAdOutput:true});h.setAd(true);
 h.run({suppressAdOutput:true});assert.equal(h.video.muted,true);
 const visible=h.run({suppressAdOutput:false,volume:40});
 assert.equal(visible.revealDisplay,true);assert.equal(h.video.muted,false);assert.equal(h.video.volume,.4);
 assert.equal(visible.position,undefined);
 h.setAd(false);h.run({suppressAdOutput:false,volume:40,muted:true});
 assert.equal(h.video.muted,true);assert.equal(h.video.currentTime,35);
});

test('channel watermark is hidden while locked and restored when unlocked or showing ads or access prompts',()=>{
 const h=harness();h.watermark.style.setProperty('opacity','.7','important');
 h.run({locked:true});assert.equal(h.watermark.style.getPropertyValue('visibility'),'hidden');
 h.run({locked:false});assert.equal(h.watermark.style.getPropertyValue('opacity'),'.7');assert.equal(h.watermark.style.getPropertyValue('visibility'),'');
 for(const kind of ['ad','barrier']) {
  h.setAd(false);h.setBarrier(false);h.run({locked:true});
  if(kind==='ad')h.setAd(true);else h.setBarrier(true);
  h.run({locked:true});assert.equal(h.watermark.style.getPropertyValue('visibility'),'');
 }
});

test('output lock hides transport chrome and restores its exact styles for manual interaction, ads and barriers',()=>{
 const h=harness();h.controls[0].style.setProperty('opacity','.8','important');
 h.run({locked:true});assert.equal(h.controls[0].style.values.visibility,'hidden');assert.equal(h.controls[1].style.values['pointer-events'],'none');
 h.run({locked:false});assert.equal(h.controls[0].style.values.opacity,'.8');assert.equal(h.controls[0].style.getPropertyPriority('opacity'),'important');assert.equal(h.controls[1].style.getPropertyValue('visibility'),'');
 for(const type of ['ad','barrier']){
  h.run({locked:true});if(type==='ad')h.setAd(true);else h.setBarrier(true);
  const report=h.run({locked:true});assert.equal(report.position,undefined);assert.equal(h.controls[0].style.values.opacity,'.8');
  h.setAd(false);h.setBarrier(false);
 }
 h.run({locked:true,generation:2});h.run({locked:false,generation:3});assert.equal(h.controls[0].style.values.opacity,'.8');
});
test('temporary interaction restores controls while retaining full output layout and queue position',()=>{
 const h=harness();h.controls[0].style.setProperty('opacity','.8','important');
 h.run({locked:true});h.advance(5000);h.video.currentTime=40;
 h.run({locked:true,interacting:true});
 assert.equal(h.controls[0].style.getPropertyValue('opacity'),'.8');
 assert.equal(h.controls[1].style.getPropertyValue('pointer-events'),'');
 assert.equal(h.player.style.getPropertyValue('position'),'fixed');
 assert.equal(h.video.style.getPropertyValue('width'),'100vw');
 assert.equal(h.video.currentTime,40);
 h.run({locked:true,interacting:false});
 assert.equal(h.controls[0].style.getPropertyValue('visibility'),'hidden');
 assert.equal(h.controls[1].style.getPropertyValue('pointer-events'),'none');
 assert.equal(h.video.currentTime,40);
});
test('watch controller uses the normal matching YouTube page and applies seek only once per generation',()=>{
 const h=harness();let report=h.run();assert.equal(h.video.currentTime,35);assert.equal(h.video.paused,false);assert.equal(report.position,35);
 assert.equal(report.href,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 assert.equal(h.player.parentElement,h.context.document.body);
 assert.equal(h.player.style.values.position,'fixed');assert.equal(h.video.style.values['object-fit'],'contain');
 h.advance(5000);h.video.currentTime=40;h.run();assert.equal(h.video.currentTime,40);
 h.run({generation:2,position:90,paused:true});assert.equal(h.video.currentTime,90);assert.equal(h.video.paused,true);
 h.context.location=new URL('https://accounts.google.com/');assert.equal(h.run(),null);
 h.context.location=new URL('https://www.youtube.com/watch?v=jNQXAC9IVRw');assert.equal(h.run(),null);
});
test('pause and resume preserve the live frame instead of seeking to an older reported checkpoint',()=>{
 const h=harness();h.run({position:35});h.advance(3000);h.video.currentTime=38;
 const paused=h.run({generation:2,transportOnly:true,position:35,paused:true});
 assert.equal(h.video.currentTime,38);assert.equal(h.video.paused,true);assert.equal(paused.position,38);
 const resumed=h.run({generation:3,transportOnly:true,position:35,paused:false});
 assert.equal(h.video.currentTime,38);assert.equal(h.video.paused,false);assert.equal(resumed.position,38);
 h.run({generation:4,transportOnly:false,position:12,paused:true});assert.equal(h.video.currentTime,12);
 h.run({generation:5,transportOnly:false,position:0});assert.equal(h.video.currentTime,0);
});

test('transport-only startup still restores the checkpoint, while pausing an in-flight seek pauses immediately',()=>{
 const startup=harness();startup.video.currentTime=100;startup.run({transportOnly:true,paused:true,position:35});assert.equal(startup.video.currentTime,35);assert.equal(startup.video.paused,true);
 const h=harness();h.run();h.video.seeking=true;h.video.paused=false;
 const paused=h.run({generation:2,transportOnly:true,paused:true});assert.equal(h.video.paused,true);assert.equal(paused.position,undefined);
});

test('video fade readiness waits for a decoded frame and reveals ads or access prompts immediately',()=>{
 const h=harness();h.video.readyState=1;assert.equal(h.run().displayReady,false);
 h.video.readyState=2;assert.equal(h.run({paused:true}).displayReady,false);h.frame();h.frame(500);assert.equal(h.run({paused:true}).displayReady,true);
 h.video.seeking=true;assert.equal(h.run().displayReady,undefined);
 h.setAd(true);assert.equal(h.run().revealDisplay,true);
 h.setAd(false);h.setBarrier(true);assert.equal(h.run().revealDisplay,true);
 h.setBarrier(false);h.video.seeking=false;h.video.readyState=0;assert.equal(h.run().displayReady,undefined);
});

test('crossfade waits for stable full-window layout and withdraws readiness when YouTube resizes it',()=>{
 const h=harness();h.setSmallLayout(true);assert.equal(h.run().displayReady,false);
 h.frame();h.frame(1000);assert.equal(h.run().displayReady,false);
 h.setSmallLayout(false);h.frame();h.frame(499);assert.equal(h.run().displayReady,false);
 h.frame(1);assert.equal(h.run().displayReady,true);
 h.setSmallLayout(true);h.frame();assert.equal(h.run().displayReady,false);
 h.setSmallLayout(false);h.frame();h.frame(500);assert.equal(h.run().displayReady,true);
});

test('old layout observers stop reporting after a seek or navigation and access prompts remain visible',()=>{
 const h=harness();h.run();h.frame();const old=h.context.window.__fPlaybackWatch;
 h.run({generation:2,position:90});h.frame(500);assert.notEqual(h.context.window.__fPlaybackWatch,old);
 h.setBarrier(true);h.frame();assert.match(h.context.document.title,/"revealDisplay":true/);
 h.setBarrier(false);h.context.location=new URL('https://accounts.google.com/');h.context.document.title='unchanged';h.frame(1000);assert.equal(h.context.document.title,'unchanged');
});

test('late YouTube history resume cannot overwrite the local checkpoint, including zero and paused playback',()=>{
 for(const position of [0,35])for(const paused of [false,true]) {
  const h=harness();h.run({position,paused});h.advance(1000);h.video.currentTime=180;
  const rejected=h.run({position,paused});assert.equal(rejected.position,undefined);assert.equal(rejected.ended,undefined);assert.equal(h.video.currentTime,position);
  h.advance(1000);h.video.currentTime=position+(paused?0:1);
  assert.equal(h.run({position,paused}).position,position+(paused?0:1));
  h.run({generation:2,position:90,paused:true});assert.equal(h.video.currentTime,90);
 }
});

test('history resume at the end cannot advance the queue and pending seeks do not report the browser position',()=>{
 const h=harness();h.run();h.video.currentTime=240;h.video.ended=true;h.context.document.title='unchanged';h.listeners.get('ended')();assert.equal(h.context.document.title,'unchanged');
 const rejected=h.run();assert.equal(rejected.ended,undefined);assert.equal(rejected.position,undefined);assert.equal(h.video.currentTime,35);
 const pending=harness();pending.video.seeking=true;assert.equal(pending.run().position,undefined);
 pending.advance(30000);assert.equal(pending.run().recover,'startup');
 pending.video.seeking=false;pending.video.currentTime=35;assert.equal(pending.run().position,35);
});

test('post-ad resume is reset to the queue checkpoint and normal later manual seeks remain available',()=>{
 const h=harness();h.run({position:35});h.setAd(true);h.advance(20000);assert.equal(h.run({position:35}).position,undefined);
 h.setAd(false);h.video.currentTime=180;assert.equal(h.run({position:35}).position,35);
 h.advance(11000);h.video.currentTime=100;assert.equal(h.run().position,100);
});

test('watch controller recovers the delayed initial homepage without navigating account or other video pages',()=>{
 const h=harness();let destination='';
 h.context.location={origin:'https://www.youtube.com',pathname:'/',replace(url){destination=url;}};
 assert.equal(h.run(),null);assert.equal(destination,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 destination='';h.context.location={origin:'https://accounts.google.com',pathname:'/',replace(url){destination=url;}};
 assert.equal(h.run(),null);assert.equal(destination,'');
});
test('watch controller preserves audio, pause, vote and completed-video transitions',()=>{
 const h=harness();h.run({volume:0,muted:true});assert.equal(h.video.volume,0);assert.equal(h.video.muted,true);
 h.run({volume:50,muted:false});assert.equal(h.video.volume,.5);assert.equal(h.video.muted,false);
 h.run({voting:true});assert.equal(h.video.paused,true);assert.equal(h.run({voting:true}).position,undefined);
 h.run();h.video.ended=true;assert.equal(h.run().ended,true);
 // Completion remains retryable if the native request is lost.
 assert.equal(h.run().ended,true);
 assert.equal(h.run({generation:2,paused:true}).ended,undefined);
});
test('watch controller holds advertisements, missing playback and account barriers without reporting completion',()=>{
 const h=harness();h.video.ended=true;h.setAd(true);assert.match(h.run().status,/Advertisement/);assert.equal(h.video.currentTime,0);
 h.setAd(false);h.setBarrier(true);let result=h.run();assert.match(result.status,/attention/);assert.equal(result.ended,undefined);assert.equal(result.position,undefined);
 h.setBarrier(false);h.video.readyState=0;result=h.run();assert.match(result.status,/access/);assert.equal(result.ended,undefined);
 // No selector or code path clicks any sign-in or content confirmation.
 assert.doesNotMatch(source,/\.click\(|fetch\(|document\.cookie|localStorage/);
});
test('ended event reports immediately before YouTube autoplay navigates, while stale and ad events are ignored',()=>{
 const h=harness();h.run();const old=h.listeners.get('ended');old();assert.match(h.context.document.title,/"ended":true/);
 h.run({generation:2});h.context.document.title='unchanged';old();assert.equal(h.context.document.title,'unchanged');
 h.setAd(true);h.listeners.get('ended')();assert.equal(h.context.document.title,'unchanged');
 h.setAd(false);h.context.location=new URL('https://www.youtube.com/watch?v=jNQXAC9IVRw');h.listeners.get('ended')();assert.equal(h.context.document.title,'unchanged');
});
test('watchdog detects stalled and buffering playback without advancing the queue or overwriting the checkpoint',()=>{
 for(const readyState of [2,4]){
  const h=harness();h.run();h.video.readyState=readyState;
  h.advance(9999);assert.equal(h.run().recover,undefined);
  h.advance(1);const report=h.run();assert.equal(report.recover,readyState===2?'buffering':'stalled');
  assert.equal(report.position,undefined);assert.equal(report.ended,undefined);assert.equal(h.video.currentTime,35);
  h.advance(1000);assert.equal(h.run().recover,report.recover);
 }
});
test('generic player errors after 135 hours request bounded native recovery without saving an error position',()=>{
 const h=harness();h.advance(135*60*60*1000);h.run();h.setPlayerError(true);
 assert.match(h.run().status,/retrying/);h.advance(29999);assert.equal(h.run().recover,undefined);
 h.advance(1);const result=h.run();assert.equal(result.recover,'player-error');
 assert.equal(result.position,undefined);assert.equal(result.ended,undefined);assert.equal(h.video.currentTime,35);
 h.setPlayerError(false);h.run();h.setPlayerError(true);assert.equal(h.run().recover,undefined);
});
test('generic error recovery never overrides access prompts, pauses, votes or ads',()=>{
 for(const mode of ['barrier','paused','voting','ad']){
  const h=harness();h.run();h.setPlayerError(true);
  if(mode==='barrier')h.setBarrier(true);if(mode==='ad')h.setAd(true);
  const command=mode==='paused'?{paused:true}:mode==='voting'?{voting:true}:{};
  h.run(command);h.advance(60000);assert.equal(h.run(command).recover,undefined);
  h.setBarrier(false);h.setAd(false);assert.equal(h.run().recover,undefined);
 }
});
test('watchdog resets on genuine progress, seeks and generation changes',()=>{
 const h=harness();h.run();h.advance(9000);h.video.currentTime=36;h.run();
 h.advance(9000);assert.equal(h.run().recover,undefined);
 h.video.currentTime=10;h.run();h.advance(9000);assert.equal(h.run().recover,undefined);
 h.run({generation:2,position:70});h.advance(9999);assert.equal(h.run({generation:2,position:70}).recover,undefined);
 h.advance(1);assert.equal(h.run({generation:2,position:70}).recover,'stalled');
});
test('watchdog holds intentional pauses, votes, advertisements and confirmation dialogs',()=>{
 for(const mode of ['paused','voting','ad','barrier']){
  const h=harness();h.run();
  const command=mode==='paused'?{paused:true}:mode==='voting'?{voting:true}:{};
  if(mode==='ad')h.setAd(true);if(mode==='barrier')h.setBarrier(true);
  h.advance(60000);const held=h.run(command);assert.equal(held.recover,undefined);
  h.setAd(false);h.setBarrier(false);assert.equal(h.run().recover,undefined);
  h.advance(9999);assert.equal(h.run().recover,undefined);
 }
});
test('watchdog gives startup time to load and resets its wait during pauses',()=>{
 const h=harness();h.video.readyState=0;h.run();h.advance(29999);assert.equal(h.run().recover,undefined);
 h.advance(1);assert.equal(h.run().recover,'startup');
 h.advance(60000);assert.equal(h.run({paused:true}).recover,undefined);
 assert.equal(h.run().recover,undefined);h.advance(30000);assert.equal(h.run().recover,'startup');
});
test('watchdog leaves blocked autoplay for manual Play and ignores old rejected play promises',async()=>{
 const h=harness();h.video.play=()=>Promise.reject(Object.assign(new Error('gesture required'),{name:'NotAllowedError'}));
 h.run();await Promise.resolve();h.advance(60000);assert.equal(h.run().recover,undefined);
 h.video.paused=false;h.video.currentTime=36;assert.equal(h.run().recover,undefined);
 h.advance(10000);assert.equal(h.run().recover,'stalled');
 const newer=harness();let reject;
 newer.video.play=()=>new Promise((resolve,no)=>{reject=no;});newer.run();
 newer.video.paused=false;newer.run({generation:2});reject(Object.assign(new Error('late'),{name:'NotAllowedError'}));await Promise.resolve();
 assert.equal(newer.context.window.__fPlaybackWatch.autoplayBlocked,false);
});
test('local worker ownership transfers explicitly and stale output cannot release or advance the active output',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'playback-native-'));
 const app=createApp({dataDir:dir,port:0,twitchEnabled:false,chatEnabled:false,titleResolver:async()=>null,env:{ADMIN_TOKEN:'test-native'}});
 await app.listen();t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+app.server.address().port;
 assert.equal((await fetch(base+'/overlay')).status,200);
 const overlay=await (await fetch(base+'/assets/overlay.js')).text();assert.doesNotMatch(overlay,/worker\/|youtube\.com|iframe/);
 const post=(route,data)=>fetch(base+'/api/worker/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
 app.engine.add('dQw4w9WgXcQ','First');app.engine.add('jNQXAC9IVRw','Next');const gen=app.engine.state.generation;
 assert.equal((await post('claim',{workerId:a})).status,200);
 assert.equal((await post('claim',{workerId:b})).status,409);
 assert.equal((await post('release',{workerId:b})).status,409);
 assert.equal((await post('release',{workerId:a})).status,200);
 assert.equal((await post('claim',{workerId:b})).status,200);
 assert.equal((await post('release',{workerId:a})).status,409);
 assert.equal((await post('ended',{workerId:a,generation:gen})).status,409);
 assert.equal((await post('progress',{workerId:b,generation:gen,position:45,duration:240})).status,200);
 assert.equal(app.engine.state.current.position,45);
 app.engine.seek(100);const stale=await (await post('progress',{workerId:b,generation:gen,position:46,duration:240})).json();assert.equal(stale.accepted,false);
 assert.equal(app.engine.state.current.position,100);
 assert.equal(app.engine.publicState({compact:true}).transportOnly,false);
 app.engine.pause(true);assert.equal(app.engine.publicState({compact:true}).transportOnly,true);
 app.engine.pause(false);assert.equal(app.engine.publicState({compact:true}).transportOnly,true);
 app.engine.seek(50);assert.equal(app.engine.publicState({compact:true}).transportOnly,false);
 app.engine.pause(true);app.engine.replay();assert.equal(app.engine.publicState({compact:true}).transportOnly,false);
});

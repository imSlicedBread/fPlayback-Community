import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchYouTubeTitle,cleanDiscoveredTitle,TitleMetadataQueue} from '../lib/title-metadata.js';

const id='dQw4w9WgXcQ';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('Title lookup uses fixed YouTube oEmbed destination, no redirects or custom URL',async()=>{
  let requested='';
  const name=await fetchYouTubeTitle(id,{fetchImpl:async (url,opts)=>{
    requested=url;
    assert.equal(opts.redirect,'error');
    assert.equal(opts.headers.Accept,'application/json');
    return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({title:'Rick Astley - Never Gonna Give You Up'})};
  }});
  assert.equal(name,'Rick Astley - Never Gonna Give You Up');
  assert.ok(requested.startsWith('https://www.youtube.com/oembed?url='));
  assert.ok(requested.includes('dQw4w9WgXcQ'));
  assert.equal(await fetchYouTubeTitle('malicious-URL',{fetchImpl:()=>{throw new Error('should not run');}}),null);
});

test('Title lookup failures and unsafe/empty data do not overwrite saved names',async()=>{
  assert.equal(cleanDiscoveredTitle('YouTube',id),null);
  assert.equal(cleanDiscoveredTitle(`YouTube · ${id}`,id),null);
  assert.equal(cleanDiscoveredTitle(' Line 1\nLine 2   ',id),'Line 1 Line 2');
  assert.equal(cleanDiscoveredTitle('x'.repeat(210),id).length,180);
  assert.equal(await fetchYouTubeTitle(id,{fetchImpl:async()=>({ok:false})}),null);
  assert.equal(await fetchYouTubeTitle(id,{fetchImpl:async()=>({ok:true,headers:{get:()=> 'text/html'},json:async()=>({title:'bad'})})}),null);
});

test('Queued lookups use bounded concurrency, deduplicate IDs and preserve user-entered titles',async()=>{
  const calls=[],changes=[];let inFlight=0,peak=0;
  const engine={state:{current:{videoId:id,title:`YouTube · ${id}`},queue:[{videoId:'jNQXAC9IVRw',title:'Custom'}],suggestions:[]},applyDiscoveredTitle(id,title){changes.push([id,title]);this.state.current.title=title;}};
  const resolver=async name=>{calls.push(name);inFlight++;peak=Math.max(inFlight,peak);await sleep(10);inFlight--;return 'Official Video Title';};
  const q=new TitleMetadataQueue(engine,{resolver,concurrency:1});
  q.enqueue([id,id,'jNQXAC9IVRw']);await sleep(40);
  assert.equal(peak,1);assert.deepEqual(calls,[id]);assert.deepEqual(changes,[[id,'Official Video Title']]);
  q.close();
});

test('Long-running title lookup churn retains bounded history without losing saved titles',async()=>{
 const videos=new Map(Array.from({length:5500},(_,i)=>{const videoId=String(i).padStart(11,'0');return [videoId,{videoId,title:`YouTube · ${videoId}`}];}));
 const engine={state:{current:null,suggestions:[]},allQueued:()=>[...videos.values()],applyDiscoveredTitle(id,title){videos.get(id).title=title;}};
 const q=new TitleMetadataQueue(engine,{resolver:async id=>`Discovered ${id}`,concurrency:2});
 const ids=[...videos.keys()];
 for(let i=0;i<ids.length;i+=500){
  q.enqueue(ids.slice(i,i+500));while(q.active||q.pending.size)await new Promise(resolve=>setImmediate(resolve));
 }
 assert.equal(videos.get(ids[0]).title,`Discovered ${ids[0]}`);
 assert.equal(videos.get(ids.at(-1)).title,`Discovered ${ids.at(-1)}`);
 assert.equal(q.cache.size,5000);assert.equal(q.retryAt.size,0);assert.equal(q.inflight.size,0);
 q.close();assert.equal(q.cache.size,0);assert.equal(q.retryAt.size,0);
});

test('transient lookup failure retries on a later enqueue after cooldown',async()=>{
 let now=0,calls=0;
 const video={videoId:id,title:''};
 const engine={state:{current:video,queue:[],suggestions:[]},applyDiscoveredTitle(_,title){video.title=title;}};
 const q=new TitleMetadataQueue(engine,{clock:()=>now,resolver:async()=>++calls===1?null:'Recovered'});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 q.enqueue([id]);await settle();
 now+=59_999;q.enqueue([id]);await settle();assert.equal(calls,1);
 now++;q.enqueue([id,id]);await settle();
 assert.equal(calls,2);assert.equal(video.title,'Recovered');q.close();
});

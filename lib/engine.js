import crypto from 'node:crypto';
import { DEFAULT_SETTINGS, normalizeSettings, validateSettings } from './config.js';
import { cleanDiscoveredTitle, isPlaceholderTitle } from './title-metadata.js';

// Library capacity is not a product limit. Import batch and abuse limits are separate.
const MAX_HISTORY=300, MAX_SUGGESTIONS=200;
const LANES=Object.freeze({playNext:'priorityQueue',current:'queue',nextRotation:'nextRotationQueue',recycled:'recycledQueue'});
export const QUEUE_DESTINATIONS=Object.freeze(Object.keys(LANES));
const QUEUE_ARRAYS=Object.freeze(Object.values(LANES));
const RECYCLED_ORDERS=['manual','title','oldest','newest'];
export function vodTitleDate(title) {
  const match=String(title).match(/\b((?:19|20|21)\d{2})(?:[./_-](\d{1,2})[./_-](\d{1,2}))?\b/);
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]||1),day=Number(match[3]||1);
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?date.getTime():null;
}
function recycledComparator(order) {
  const title=(a,b)=>a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:'base'});
  return order==='title'?title:(a,b)=>{
    const left=vodTitleDate(a.title),right=vodTitleDate(b.title);
    if(left===null)return right===null?title(a,b):1;
    if(right===null)return -1;
    return (order==='newest'?right-left:left-right)||title(a,b);
  };
}
function requireLane(lane) {
  if(!Object.hasOwn(LANES,lane))throw new Error('Invalid queue destination');
  return LANES[lane];
}
function parsedPublicationDate(v) {
  if(typeof v!=='string')return null;
  const iso=/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/;
  if(!iso.test(v)||!Number.isFinite(Date.parse(v)))return null;
  return new Date(v).toISOString();
}

export function parseYoutube(value) {
  if (typeof value !== 'string') throw new Error('Enter a YouTube URL or video ID');
  const s=value.trim();let id=s;
  if (s.includes('/') || s.includes('?')) {
    let u; try {u=new URL(s);}catch{throw new Error('Invalid YouTube URL');}
    const host=u.hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'');
    if(host==='youtu.be')id=u.pathname.split('/')[1];
    else if(host==='youtube.com'||host==='youtube-nocookie.com'||host==='music.youtube.com') {
      if(u.pathname==='/watch')id=u.searchParams.get('v');
      else if (/^\/(shorts|live|embed)\//.test(u.pathname)) id=u.pathname.split('/')[2];
    } else throw new Error('Only YouTube URLs are supported');
  }
  if(!/^[a-zA-Z0-9_-]{11}$/.test(id||''))throw new Error('Invalid YouTube video ID');
  return id;
}
function sanitizedTitle(t,id) {
  const value=typeof t==='string'?t.trim():'';
  if(value.length>180 || /[\u0000-\u001F\u007F]/.test(value))throw new Error('Title must have no control characters and at most 180 characters');
  return value||`YouTube · ${id}`;
}
export function normalizeVideo(raw) {
  if(typeof raw==='string')raw={url:raw};
  if(!raw||typeof raw!=='object')throw new Error('Invalid video');
  let candidate=raw.videoId??raw.youtubeId??raw.url??raw.video_url??raw.id;
  const videoId=parseYoutube(String(candidate||''));
  const title=sanitizedTitle(raw.title??raw.name,videoId);
  return { id:typeof raw.id==='string'&&raw.id!==videoId&&raw.id.length<70?raw.id:crypto.randomUUID(), videoId,title,position:0,duration:0,paused:false };
}
const copy = v=>JSON.parse(JSON.stringify(v));
function readOldSettings(raw) {
  const s=raw.settings||{};
  // Old releases used either a nested settings object or direct top-level fields.
  const merged={...s};
  if(raw.loop!==undefined&&merged.loop===undefined)merged.loop=raw.loop;
  if(raw.voteOnEnd!==undefined&&merged.voteOnEnd===undefined)merged.voteOnEnd=raw.voteOnEnd;
  if(s.lowerThirdLayout && !s.lowerThird)merged.lowerThird=s.lowerThirdLayout;
  if(s.palette && !s.colors)merged.colors=s.palette;
  if(typeof merged.lowerThird?.bottomAnchor==='boolean' && !merged.lowerThird.anchor) merged.lowerThird.anchor=merged.lowerThird.bottomAnchor?'bottom':'top';
  if(merged.lowerThird){const {bottomAnchor,...lt}=merged.lowerThird; merged.lowerThird=lt;}
  for(const key of Object.keys(merged))if(!(key in DEFAULT_SETTINGS))delete merged[key];
  try{return validateSettings(merged);}catch{return normalizeSettings({});}
}
function legacyVideo(v) {
  try{return normalizeVideo(v);}catch{return null;}
}
/** Upgrade 1.x queues without consuming the current video or skipping offline time. */
export function migrateState(raw) {
  const empty=()=>({schemaVersion:2,revision:1,layoutRevision:1,rotationNumber:1,
    current:null,queue:[],priorityQueue:[],recycledQueue:[],recycledOrder:'manual',nextRotationQueue:[],history:[],vote:null,
    skipBallots:{},suggestions:[],settings:normalizeSettings({}),audio:{volume:100,muted:false},
    updatedAt:new Date().toISOString(),generation:1});
  if(!raw)return empty();
  if(raw.schemaVersion>2)throw new Error('Saved state is from a newer Playback version; refusing to downgrade it');
  if(raw.schemaVersion===1||raw.schemaVersion===2){
    const next={...empty(),...raw,schemaVersion:2,settings:readOldSettings(raw)};
    next.recycledOrder=RECYCLED_ORDERS.includes(raw.recycledOrder)?raw.recycledOrder:'manual';
    next.audio={
      volume:Number.isInteger(raw.audio?.volume)&&raw.audio.volume>=0&&raw.audio.volume<=100?raw.audio.volume:100,
      muted:typeof raw.audio?.muted==='boolean'?raw.audio.muted:false
    };
    if(next.audio.volume===0)next.audio.muted=true;
    for(const name of QUEUE_ARRAYS){
      next[name]=Array.isArray(raw[name])?raw[name].filter(v=>v&&typeof v==='object'):[];
    }
    next.rotationNumber=Number.isSafeInteger(raw.rotationNumber)&&raw.rotationNumber>0?raw.rotationNumber:1;
    next.history=Array.isArray(raw.history)?raw.history.slice(-MAX_HISTORY):[];
    next.suggestions=Array.isArray(raw.suggestions)?raw.suggestions.slice(-MAX_SUGGESTIONS):[];
    if(raw.schemaVersion===1){
      next.migratedFrom='1.x';
      next.migrationNotice='Your existing queue was preserved as Upcoming (Rotation 1). The original 1.x state has been backed up.';
    }
    return next;
  }
  const source=raw.playback||raw;
  const queue=(raw.queue||raw.playlist?.queue||raw.playlist||[]);
  const current=source.current||raw.currentVideo||raw.nowPlaying||null;
  const cur=current?legacyVideo(current):null;
  if(cur){
    const position=source.position??source.currentTime??raw.position??raw.currentTime??current.position??current.currentTime??0;
    cur.position=Number.isFinite(Number(position))?Math.max(0,Number(position)):0;
    const duration=source.duration??current.duration??0;
    cur.duration=Number.isFinite(Number(duration))?Math.max(0,Number(duration)):0;
    cur.paused=Boolean(source.paused??raw.paused??false);
  }
  const state=empty();
  state.current=cur;
  state.queue=(Array.isArray(queue)?queue:[]).map(legacyVideo).filter(Boolean);
  state.history=(Array.isArray(raw.history)?raw.history:[]).map(legacyVideo).filter(Boolean).slice(-MAX_HISTORY);
  state.settings=readOldSettings(raw);
  state.migratedFrom='legacy';
  state.migrationNotice='Prior state backed up; confirm legacy queue and settings in Studio.';
  return state;
}

export class PlaybackEngine {
  constructor(store, {clock=()=>Date.now(), identitySecret='station'}={}) {
    this.store=store;this.clock=clock;this.identitySecret=identitySecret;
    const previous=store?.load?.();
    if(previous && previous.schemaVersion!==2)store?.backupLegacy?.(previous);
    this.state=migrateState(previous);
    // Older Previous transitions could park the currently playing entry itself.
    let repaired=false;
    if(this.state.current){
      for(const lane of QUEUE_ARRAYS){
        const rows=this.state[lane];
        if(rows.some(entry=>entry.id===this.state.current.id)){
          this.state[lane]=rows.filter(entry=>entry.id!==this.state.current.id);
          repaired=true;
        }
      }
      if(repaired)this.invalidateVoteEntry(this.state.current.id);
    }
    this.lastTick=this.clock();
    this.outputAcks=new Map();
    // This token describes queue/history/suggestion changes, not playhead ticks.
    // A new epoch on every process start prevents stale browser caches on restart.
    this.catalogEpoch=crypto.randomUUID();this.catalogCounter=0;this.catalogCache=null;
    if(!previous||previous.schemaVersion!==2||store?.needsMigration||repaired)this.save();
  }
  get catalogRevision(){return `${this.catalogEpoch}:${this.catalogCounter}`;}
  save({catalogChanged=true}={}){
    this.state.revision++;this.state.updatedAt=new Date(this.clock()).toISOString();
    try{this.store?.write?.(this.state,{catalogChanged});
      if(catalogChanged){this.catalogCounter++;this.catalogCache=null;}
    }
    catch(e){
      // The authoritative state is the last durable snapshot, never unsaved in-memory changes.
      try{this.state=migrateState(this.store.load());}catch{}
      // Force clients to reload after rolling back an unsuccessful durable write.
      this.catalogCounter++;this.catalogCache=null;
      throw Object.assign(new Error(`Could not persist state: ${e.message}`),{status:503});
    }
  }
  get settings(){return this.state.settings;}
  hashViewer(kind,id){return crypto.createHmac('sha256',this.identitySecret).update(`${kind}:${id}`).digest('hex');}
  allEntries(){return [this.state.current,...QUEUE_ARRAYS.flatMap(key=>this.state[key]),...this.state.history,...this.state.suggestions].filter(Boolean);}
  allQueued(){return QUEUE_ARRAYS.flatMap(key=>this.state[key]);}
  playable(){return [...this.state.priorityQueue,...this.state.queue];}
  queuedCount(){return QUEUE_ARRAYS.reduce((n,key)=>n+this.state[key].length,0);}
  storedCount(){return this.queuedCount()+(this.state.current?1:0);}
  findQueueEntry(id){
    for(const [lane,key] of Object.entries(LANES)){
      const index=this.state[key].findIndex(v=>v.id===id);
      if(index>=0)return {lane,key,index,video:this.state[key][index]};
    }
    return null;
  }
  batchTitleLookup() {
    let known;
    return id=>{
      if(!known){
        known=new Map();
        for(const entry of this.allEntries()){
          if(!known.has(entry.videoId)&&!isPlaceholderTitle(entry.title,entry.videoId))known.set(entry.videoId,entry.title);
        }
      }
      return known.get(id);
    };
  }
  newVideo(url,title,metadata={},lookupTitle) {
    const id=parseYoutube(url);let name=sanitizedTitle(title,id);
    if(isPlaceholderTitle(name,id)){
      const known=lookupTitle?lookupTitle(id):this.allEntries().find(v=>v.videoId===id&&!isPlaceholderTitle(v.title,id))?.title;
      if(known)name=known;
    }
    const result={id:crypto.randomUUID(),videoId:id,title:name,position:0,duration:0,paused:false,
      addedAt:new Date(this.clock()).toISOString(),playCount:0,lastPlayedAt:null,lastPlayedRotation:null};
    const publishedAt=parsedPublicationDate(metadata.publishedAt);
    if(publishedAt)result.publishedAt=publishedAt;
    return result;
  }
  /** The rollover is a single durable state transition with the next activation. */
  orderRecycled(){
    if(this.state.recycledOrder!=='manual')this.state.recycledQueue.sort(recycledComparator(this.state.recycledOrder));
  }
  appendToLane(key,videos){
    this.state[key]=this.state[key].concat(videos);
    if(key==='recycledQueue')this.orderRecycled();
  }
  sortRecycled(order){
    if(!RECYCLED_ORDERS.includes(order))throw new Error('Invalid Recycled sort order');
    this.state.recycledOrder=order;this.orderRecycled();this.save();return this.state.recycledQueue.length;
  }
  promoteNextRotation(){
    if(this.playable().length||!this.settings.loop)return false;
    if(!this.state.recycledQueue.length&&!this.state.nextRotationQueue.length)return false;
    const future=this.state.nextRotationQueue.splice(0);
    const recycled=this.state.recycledQueue.splice(0);
    this.state.queue=this.state.queue.concat(future,recycled);
    this.state.rotationNumber++;
    return true;
  }
  /** Completed/skipped items are held back until the upcoming lane is exhausted. */
  rotateCurrent(reason='completed'){
    if(!this.state.current)return;
    const c=copy(this.state.current);
    const timestamp=new Date(this.clock()).toISOString();
    c.playCount=(Number.isSafeInteger(c.playCount)?c.playCount:0)+1;
    c.lastPlayedAt=timestamp;c.lastPlayedRotation=this.state.rotationNumber;
    this.state.history.push({...c,reason,playedAt:timestamp,rotationNumber:this.state.rotationNumber});
    this.state.history=this.state.history.slice(-MAX_HISTORY);
    if(this.settings.loop){
      this.appendToLane('recycledQueue',[{...c,position:0,paused:false}]);
    }
    this.state.current=null;
  }
  /** Interrupted play is resumed after the requested video, at the original timestamp. */
  parkCurrent(){
    if(!this.state.current)return;
    this.state.priorityQueue.unshift({...this.state.current});this.state.current=null;
  }
  activateAt(index=0){
    if(!this.playable().length)this.promoteNextRotation();
    const playable=this.playable();
    if(!playable.length){this.state.current=null;this.state.vote=null;this.state.skipBallots={};this.state.generation++;return;}
    if(!Number.isInteger(index)||index<0||index>=playable.length)throw new Error('Invalid queue position');
    const id=playable[index].id;
    this.activateById(id);
  }
  activateById(id){
    const found=this.findQueueEntry(id);
    if(!found||!['playNext','current'].includes(found.lane))throw new Error('Video not found in playable queue');
    const [chosen]=this.state[found.key].splice(found.index,1);
    const shouldResume=Number.isFinite(chosen.position)&&chosen.position>0;
    this.state.current={...chosen,position:shouldResume?chosen.position:0,paused:false};
    this.state.vote=null;this.state.skipBallots={};this.state.generation++;
  }
  add(url,title,{now=false,front=false,destination='current'}={}){
    if(now){
      const v=this.newVideo(url,title);
      
      this.parkCurrent();this.state.queue.unshift(v);this.activateById(v.id);
      this.save();return v;
    }
    if(front)destination='playNext';
    const key=requireLane(destination);
    const v=this.newVideo(url,title);
    this.appendToLane(key,[v]);
    if(destination!=='recycled'){
      if(!this.state.current&&destination!=='nextRotation')this.activateAt(0);
      else if(!this.state.current&&!this.playable().length)this.activateAt(0);
    }
    this.save();return v;
  }
  bulkAdd(lines,{destination='current'}={}){
    const key=requireLane(destination);
    if(!Array.isArray(lines)||lines.length>300)throw new Error('Import up to 300 videos at a time');
    const lookupTitle=this.batchTitleLookup();
    const videos=lines.map(line=>{
      if(typeof line==='string'){const [url,...title]=line.split(/\s*\|\s*/);return this.newVideo(url,title.join(' | '),{},lookupTitle);}
      if(!line||typeof line!=='object')throw new Error('Invalid video');
      return this.newVideo(line.url||line.videoId,line.title,{},lookupTitle);
    });
    
    this.appendToLane(key,videos);
    if(!this.state.current&&destination!=='recycled')this.activateAt(0);
    this.save();return videos.length;
  }
  /** Import a selected playlist in the chosen rotation while preserving the active playhead. */
  importPlaylist(videos,{skipDuplicates=true,destination='current',order='original'}={}){
    const key=requireLane(destination);
    if(!Array.isArray(videos)||videos.length>500)throw new Error('Import up to 500 playlist videos at once');
    if(typeof skipDuplicates!=='boolean')throw new Error('Invalid duplicate option');
    if(!['original','oldest','newest'].includes(order))throw new Error('Invalid playlist ordering');
    const seen=new Set(skipDuplicates?[this.state.current,...this.allQueued()].filter(Boolean).map(v=>v.videoId):[]);
    const lookupTitle=this.batchTitleLookup();
    const prepared=[];let skipped=0;
    for(const item of videos){
      if(!item||typeof item!=='object')throw new Error('Invalid playlist entry');
      const video=this.newVideo(item.videoId,item.title,{publishedAt:item.publishedAt},lookupTitle);
      if(skipDuplicates&&seen.has(video.videoId)){skipped++;continue;}
      seen.add(video.videoId);
      if(typeof item.duration==='number'&&Number.isFinite(item.duration)&&item.duration>=0&&item.duration<=86400)video.duration=item.duration;
      prepared.push(video);
    }
    if(order!=='original'){
      prepared.sort((a,b)=>{
        if(!a.publishedAt)return b.publishedAt?1:0;
        if(!b.publishedAt)return -1;
        const cmp=a.publishedAt.localeCompare(b.publishedAt);
        return order==='oldest'?cmp:-cmp;
      });
    }
    
    if(prepared.length){
      this.appendToLane(key,prepared);
      if(!this.state.current&&destination!=='recycled')this.activateAt(0);
      this.save();
    }
    return {added:prepared.length,skipped,queued:this.playable().length,destination};
  }
  skip(){this.rotateCurrent('skipped');this.activateAt();this.save();}
  failVideo(){
    if(!this.state.current||this.state.vote)return;
    this.state.history.push({...this.state.current,unavailable:true,reason:'unavailable',playedAt:new Date(this.clock()).toISOString(),rotationNumber:this.state.rotationNumber});
    this.state.history=this.state.history.slice(-MAX_HISTORY);
    this.state.current=null;this.activateAt();this.save();
  }
  replay(){if(!this.state.current)throw new Error('Nothing to replay');this.state.current.position=0;this.state.current.paused=false;this.state.vote=null;this.state.skipBallots={};this.state.generation++;this.save({catalogChanged:false});}
  previous(){
    const last=this.state.history.pop();if(!last)throw new Error('No previous video');
    // The same entry might already be in Recycled: remove it before replaying.
    const prior=this.findQueueEntry(last.id);
    if(prior)this.state[prior.key].splice(prior.index,1);
    if(this.state.current?.id!==last.id)this.parkCurrent();
    this.state.current={...last,position:0,paused:false};
    this.state.vote=null;this.state.skipBallots={};this.state.generation++;this.save();
  }
  invalidateVoteEntry(id){
    if(!this.state.vote)return;
    for(let i=0;i<this.state.vote.choices.length;i++)if(this.state.vote.choices[i]===id){
      this.state.vote.choices[i]=null;
      for(const [v,c] of Object.entries(this.state.vote.ballots))if(c===i)delete this.state.vote.ballots[v];
    }
  }
  remove(id){
    const found=this.findQueueEntry(id);if(!found)throw new Error('Video not found in queue');
    this.state[found.key].splice(found.index,1);this.invalidateVoteEntry(id);this.save();
  }
  reorder(id,to){
    const f=this.findQueueEntry(id);if(!f)throw new Error('Video not found in queue');
    if(!Number.isInteger(to)||to<0||to>=this.state[f.key].length)throw new Error('Invalid position');
    const [v]=this.state[f.key].splice(f.index,1);this.state[f.key].splice(to,0,v);
    if(f.key==='recycledQueue')this.state.recycledOrder='manual';
    this.save();
  }
  move(id,destination){
    const key=requireLane(destination),f=this.findQueueEntry(id);
    if(!f)throw new Error('Video not found in queue');
    if(f.key===key)return false;
    const [v]=this.state[f.key].splice(f.index,1);this.appendToLane(key,[v]);
    if(destination!=='current'&&destination!=='playNext')this.invalidateVoteEntry(id);
    if(!this.state.current)this.activateAt(0);
    this.save();return true;
  }
  moveMany(ids,destination){
    const key=requireLane(destination);
    if(!Array.isArray(ids)||!ids.length||ids.length>500||new Set(ids).size!==ids.length)throw new Error('Select 1–500 unique queue entries');
    // Gather all requested IDs in one linear pass, then mutate each source lane
    // once. Repeated findQueueEntry/splice calls made a 500-item operation
    // quadratic against large 10,000+ video libraries.
    const wanted=new Set(ids),found=new Map();
    for(const source of QUEUE_ARRAYS)for(const video of this.state[source]){
      if(wanted.has(video.id))found.set(video.id,{source,video});
    }
    if(found.size!==wanted.size)throw new Error('Video not found in queue');
    const moving=new Set(ids.filter(id=>found.get(id).source!==key));
    if(moving.size){
      for(const source of QUEUE_ARRAYS){
        if(source!==key)this.state[source]=this.state[source].filter(video=>!moving.has(video.id));
      }
      // Preserve selected ordering when the user moves a filtered subset.
      // Requests already in the destination remain in their original positions.
      for(const id of ids)if(moving.has(id)){
        this.state[key].push(found.get(id).video);
        if(destination!=='current'&&destination!=='playNext')this.invalidateVoteEntry(id);
      }
      if(key==='recycledQueue')this.orderRecycled();
    }
    if(!this.state.current)this.activateAt(0);
    this.save();return ids.length;
  }
  sortUpcoming(order){
    if(!['oldest','newest','title','added','shuffle'].includes(order))throw new Error('Invalid rotation sort order');
    const q=this.state.queue;
    if(order==='shuffle'){
      for(let i=q.length-1;i>0;i--){const j=crypto.randomInt(i+1);[q[i],q[j]]=[q[j],q[i]];}
    }else if(order==='title')q.sort((a,b)=>a.title.localeCompare(b.title));
    else if(order==='added')q.sort((a,b)=>String(a.addedAt||'').localeCompare(String(b.addedAt||'')));
    else q.sort((a,b)=>{
      if(!a.publishedAt)return b.publishedAt?1:0;
      if(!b.publishedAt)return -1;
      const cmp=a.publishedAt.localeCompare(b.publishedAt);return order==='oldest'?cmp:-cmp;
    });
    this.save();return q.length;
  }
  playNow(id){
    const found=this.findQueueEntry(id);if(!found)throw new Error('Video not found');
    if(this.state.current)this.parkCurrent();
    const selected=this.findQueueEntry(id);
    const [video]=this.state[selected.key].splice(selected.index,1);
    this.state.priorityQueue.unshift({...video,position:0,paused:false});
    this.activateById(video.id);this.save();
  }
  pause(paused){if(!this.state.current||this.state.vote)throw new Error('No playing video');this.state.current.paused=Boolean(paused);this.state.generation++;this.transportGeneration=this.state.generation;this.save({catalogChanged:false});}
  seek(position){if(!this.state.current||this.state.vote)throw new Error('No playing video');if(typeof position!=='number'||!Number.isFinite(position)||position<0||position>86400)throw new Error('Invalid seek time');this.state.current.position=this.state.current.duration?Math.min(position,this.state.current.duration):position;this.state.generation++;this.save({catalogChanged:false});}
  applyDiscoveredTitle(videoId,title,{save=true}={}){
    const clean=cleanDiscoveredTitle(title,videoId);
    if(!clean)return false;
    let changed=false;
    for(const item of this.allEntries()){
      if(item?.videoId===videoId&&isPlaceholderTitle(item.title,videoId)){item.title=clean;changed=true;}
    }
    if(changed)this.orderRecycled();
    if(changed&&save)this.save();
    return changed;
  }
  updatePosition(generation,position,duration,title,videoId){
    if(!this.state.current||this.state.vote||generation!==this.state.generation)return false;
    if(typeof position!=='number'||!Number.isFinite(position)||position<0||position>86400)return false;
    let changed=Math.abs(this.state.current.position-position)>0.25;
    this.state.current.position=position;
    if(typeof duration==='number'&&Number.isFinite(duration)&&duration>=0&&duration<=86400){if(Math.abs((this.state.current.duration||0)-duration)>0.2)changed=true;this.state.current.duration=duration;}
    // The title must belong to the current generation AND the matching video ID.
    const titleChanged=videoId===this.state.current.videoId && this.applyDiscoveredTitle(videoId,title,{save:false});
    if(titleChanged)changed=true;
    if(changed)this.save({catalogChanged:titleChanged});return true;
  }
  startVote({automatic=false}={}){
    if(!this.state.current||this.state.vote)throw new Error('Voting requires an active video and no existing round');
    // Promote the old recycled pool only when there are no fresh upcoming entries.
    this.promoteNextRotation();
    const choices=this.playable().slice(0,4).map(v=>v.id);
    if(!choices.length)throw new Error('Add a queued video to start voting');
    const wasPaused=this.state.current.paused;this.state.current.paused=true;
    this.state.vote={id:crypto.randomUUID(),choices,remaining:this.settings.voteSeconds,ballots:{},manual:!automatic,wasPaused};
    this.save();this.lastTick=this.clock();
  }
  cancelVote(){
    if(!this.state.vote)throw new Error('No active vote');
    const {manual,wasPaused}=this.state.vote;this.state.vote=null;
    if(this.state.current){this.state.current.paused=manual?wasPaused:false;if(!manual)this.state.current.position=0;}
    this.state.generation++;this.save({catalogChanged:false});
  }
  ended(generation){
    if(!this.state.current||this.state.vote||generation!==this.state.generation)return false;
    if(this.settings.voteOnEnd){
      this.promoteNextRotation();
      if(this.playable().length){this.startVote({automatic:true});return true;}
    }
    this.rotateCurrent();this.activateAt();this.save();return true;
  }
  voteChoice(index,viewerHash){
    if(!this.state.vote)throw new Error('No active voting round');
    if(!Number.isInteger(index)||index<1||index>4)throw new Error('Vote must be 1-4');
    const id=this.state.vote.choices[index-1];
    if(!id||!this.playable().some(v=>v.id===id))throw new Error('Choice is unavailable');
    if(!(viewerHash in this.state.vote.ballots)&&Object.keys(this.state.vote.ballots).length>=20000)throw new Error('Voting capacity reached');
    this.state.vote.ballots[viewerHash]=index-1;this.save({catalogChanged:false});return this.getVotes();
  }
  getVotes(){
    const counts=[0,0,0,0],v=this.state.vote;
    if(v){const eligible=new Set(this.playable().map(q=>q.id));
      for(const choice of Object.values(v.ballots))if(Number.isInteger(choice)&&v.choices[choice]&&eligible.has(v.choices[choice]))counts[choice]++;
    }
    return counts;
  }
  choose(index){
    if(!this.state.vote)throw new Error('No active vote');
    if(!Number.isInteger(index)||index<1||index>4)throw new Error('Invalid choice');
    const id=this.state.vote.choices[index-1];
    if(!this.playable().some(v=>v.id===id))throw new Error('Choice is unavailable');
    this.rotateCurrent();this.activateById(id);this.save();
  }
  conclude(){
    const vote=this.state.vote;if(!vote)return;
    const counts=this.getVotes();let win=-1,highest=-1;
    const eligible=new Set(this.playable().map(v=>v.id));
    for(let i=0;i<4;i++)if(vote.choices[i]&&eligible.has(vote.choices[i])&&counts[i]>highest){win=i;highest=counts[i];}
    this.rotateCurrent();
    if(win>=0)this.activateById(vote.choices[win]);
    else this.activateAt();
    this.save();
  }
  tick(){
    const now=this.clock();let seconds=Math.floor((now-this.lastTick)/1000);
    if(seconds<=0)return;
    if(this.state.vote){this.state.vote.remaining=Math.max(0,this.state.vote.remaining-seconds);if(this.state.vote.remaining<=0)this.conclude();else this.save({catalogChanged:false});}
    this.lastTick+=seconds*1000;
  }
  skipVote(viewerHash){
    if(!this.settings.skipVoting||!this.state.current||this.state.vote)throw new Error('Skip voting unavailable');
    if(!(viewerHash in this.state.skipBallots)&&Object.keys(this.state.skipBallots).length>=20000)throw new Error('Voting capacity reached');
    this.state.skipBallots[viewerHash]=true;const count=Object.keys(this.state.skipBallots).length;
    if(count>=this.settings.skipThreshold)this.skip();else this.save({catalogChanged:false});return count;
  }
  suggest(url,title,viewerHash){
    if(!this.settings.allowSuggestions)throw new Error('Suggestions disabled');
    if(this.state.suggestions.length>=MAX_SUGGESTIONS)throw new Error('Suggestion inbox is full');
    if(this.state.suggestions.filter(s=>s.viewer===viewerHash).length>=3)throw new Error('Suggestion limit reached');
    const v=this.newVideo(url,title);
    this.state.suggestions.push({...v,viewer:viewerHash,createdAt:this.clock()});this.save();return v.id;
  }
  moderate(id,approved){
    const i=this.state.suggestions.findIndex(v=>v.id===id);if(i<0)throw new Error('Suggestion not found');
    const [v]=this.state.suggestions.splice(i,1);
    if(approved){this.state.queue.push({id:v.id,videoId:v.videoId,title:v.title,position:0,duration:0,paused:false,addedAt:new Date(this.clock()).toISOString(),playCount:0});if(!this.state.current)this.activateAt();}
    this.save();
  }
  setAudio(volume,muted){
    if(!Number.isInteger(volume)||volume<0||volume>100)throw new Error('Volume must be an integer from 0 to 100');
    if(typeof muted!=='boolean')throw new Error('Mute must be a boolean');
    const audio={volume,muted:muted||volume===0};
    if(this.state.audio.volume===audio.volume&&this.state.audio.muted===audio.muted)return audio;
    this.state.audio=audio;
    this.save({catalogChanged:false});
    return audio;
  }
  saveSettings(input){
    // Older dashboard tabs do not know this private field; do not revoke access
    // merely because such a tab saves unrelated settings.
    if(input && typeof input==='object' && !Array.isArray(input)){
      input={...input};
      for(const key of ['twitchAdminWhitelist','kickAdminWhitelist','soopAdminWhitelist','kickEnabled','kickChannel','kickChatroomId','soopEnabled','soopChannel','youtubeAccountPlayback']){
        if(!Object.hasOwn(input,key))input[key]=this.settings[key];
      }
    }
    const settings=validateSettings(input);
    const changedTwitch=settings.twitchChannel!==this.settings.twitchChannel||settings.twitchMode!==this.settings.twitchMode;
    const changedKick=['kickEnabled','kickChannel','kickChatroomId'].some(key=>settings[key]!==this.settings[key]);
    const changedSoop=['soopEnabled','soopChannel'].some(key=>settings[key]!==this.settings[key]);
    this.state.settings=settings;this.state.layoutRevision++;this.save({catalogChanged:false});return {changedTwitch,changedKick,changedSoop};
  }
  outputAck(id,layoutRevision,flags={}){
    this.getOutputStatus();this.outputAcks.delete(id);
    this.outputAcks.set(id,{id,layoutRevision,clean:Boolean(flags.clean),timestamp:this.clock()});
    while(this.outputAcks.size>256)this.outputAcks.delete(this.outputAcks.keys().next().value);
  }
  getOutputStatus(){
    const now=this.clock();for(const [id,entry] of this.outputAcks)if(now-entry.timestamp>=16000)this.outputAcks.delete(id);
    return [...this.outputAcks.values()];
  }
  publicState({compact=false}={}){
    const s=this.state;
    const {twitchAdminWhitelist,kickAdminWhitelist,soopAdminWhitelist,...publicSettings}=s.settings;
    const selectable=s.vote||!compact?this.playable():[];
    const compactVideo=v=>({id:v.id,videoId:v.videoId,title:v.title,duration:v.duration||0,
      playCount:v.playCount||0,addedAt:v.addedAt||null,publishedAt:v.publishedAt||null,
      lastPlayedAt:v.lastPlayedAt||null,lastPlayedRotation:v.lastPlayedRotation||null});
    const vote=s.vote?{
      id:s.vote.id,remaining:s.vote.remaining,counts:this.getVotes(),
      choices:s.vote.choices.map(id=>selectable.find(v=>v.id===id)||null).map(v=>v&&compactVideo(v))
    }:null;
    const lanes={playNext:s.priorityQueue.length,upcoming:s.queue.length,recycled:s.recycledQueue.length,nextRotation:s.nextRotationQueue.length};
    return {revision:s.revision,layoutRevision:s.layoutRevision,generation:s.generation,
      transportOnly:this.transportGeneration===s.generation,
      rotationNumber:s.rotationNumber,recycledOrder:s.recycledOrder,rotationCounts:lanes,playableCount:lanes.playNext+lanes.upcoming,
      current:s.current?{...s.current}:null,
      ...(compact?{}:{queue:selectable.map(compactVideo),upcomingQueue:s.queue.map(compactVideo),priorityQueue:s.priorityQueue.map(compactVideo),
      recycledQueue:s.recycledQueue.map(compactVideo),nextRotationQueue:s.nextRotationQueue.map(compactVideo)}),
      vote,skipCount:Object.keys(s.skipBallots).length,settings:copy(publicSettings),audio:{...s.audio}};
  }
  operatorState(){return {...this.publicState(),settings:copy(this.settings),history:copy(this.state.history.slice(-30)),suggestions:this.state.suggestions.map(({viewer,...s})=>s),outputs:this.getOutputStatus(),migrationNotice:this.state.migrationNotice||null};}
  /** Send each lane once on first load / catalog changes; heartbeat polls stay small. */
  dashboardState(knownRevision=null){
    const live={...this.publicState({compact:true}),settings:copy(this.settings),catalogRevision:this.catalogRevision,
      historyCount:this.state.history.length,outputs:this.getOutputStatus(),migrationNotice:this.state.migrationNotice||null};
    if(knownRevision==='omit'||knownRevision===this.catalogRevision)return live;
    if(!this.catalogCache){
      const compact=v=>({id:v.id,videoId:v.videoId,title:v.title,duration:v.duration||0,
        playCount:v.playCount||0,addedAt:v.addedAt||null,publishedAt:v.publishedAt||null,
        lastPlayedAt:v.lastPlayedAt||null,lastPlayedRotation:v.lastPlayedRotation||null});
      this.catalogCache={upcomingQueue:this.state.queue.map(compact),priorityQueue:this.state.priorityQueue.map(compact),
        recycledQueue:this.state.recycledQueue.map(compact),nextRotationQueue:this.state.nextRotationQueue.map(compact),
        history:copy(this.state.history.slice(-30)),suggestions:this.state.suggestions.map(({viewer,...v})=>({...v}))};
    }
    return {...live,catalog:this.catalogCache};
  }

}

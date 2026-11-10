import {OverlayPresentation} from './overlay-presentation.js';
import http from 'node:http';
import {VERSION} from './version.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PlaybackEngine } from './engine.js';
import { privateSecret, processLock } from './store.js';
import { SQLiteStore } from './sqlite-store.js';
import { TwitchConnector } from './twitch.js';
import { ChatAdminDispatcher } from './chat-admin.js';
import { KickConnector } from './kick.js';
import { SoopConnector } from './soop.js';
import { TitleMetadataQueue, fetchYouTubeTitle } from './title-metadata.js';
import { extractYouTubePlaylist, parsePlaylistUrl, playlistWindow, normalizePlaylist } from './playlist-import.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PUBLIC=path.resolve(__dirname,'../public');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const SESS_MS=12*3600*1000;
const REMEMBER_MS=30*24*3600*1000;
const timingEqual=(a,b)=>{const aa=Buffer.from(String(a));const bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);};
const safeJson=obj=>JSON.stringify(obj);
const isLocal=address=>/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(address||'');
const secureHeaders={
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
  'X-Frame-Options':'SAMEORIGIN','Cross-Origin-Resource-Policy':'same-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://s.ytimg.com; style-src 'self' 'unsafe-inline'; img-src 'self' https://i.ytimg.com https://img.youtube.com data:; frame-src https://www.youtube-nocookie.com https://www.youtube.com; connect-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://*.googlevideo.com;"
};
function json(res, status, data, extra={}){res.writeHead(status,{...secureHeaders,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(safeJson(data));}
async function body(req){
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw Object.assign(new Error('Expected application/json'),{status:415});
  let chunks=[],size=0;for await(const part of req){size+=part.length;if(size>128*1024)throw Object.assign(new Error('Request too large'),{status:413});chunks.push(part);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}
}
function readCookies(req){const result={};for(const raw of (req.headers.cookie||'').split(';')){const at=raw.indexOf('=');if(at>0)result[raw.slice(0,at).trim()]=raw.slice(at+1).trim();}return result;}
function signCookie(value,secret){return crypto.createHmac('sha256',secret).update(value).digest('base64url');}
function loginSession(secret,duration=SESS_MS){const token=Buffer.from(JSON.stringify({exp:Date.now()+duration,nonce:crypto.randomBytes(12).toString('hex')})).toString('base64url');return `${token}.${signCookie(token,secret)}`;}
function validSession(cookie,secret){
  if(!cookie||!cookie.includes('.'))return false;const [p,s]=cookie.split('.');if(!timingEqual(signCookie(p,secret),s))return false;
  try{const value=JSON.parse(Buffer.from(p,'base64url'));return typeof value.exp==='number' && value.exp>Date.now();}catch{return false;}
}
export function createApp({dataDir=path.resolve('data'),host='127.0.0.1',port=4177,env=process.env,clock=()=>Date.now(),twitchEnabled=true,chatEnabled=true,titleResolver=fetchYouTubeTitle,playlistExtractor=extractYouTubePlaylist}={}) {
  if(!isLocal(host) && host!=='localhost' && env.ALLOW_REMOTE!=='1') throw new Error('Remote binding blocked. Use loopback or configure ALLOW_REMOTE=1 behind an HTTPS reverse proxy.');
  const release=processLock(dataDir);let engine,store;
  try {
    store=new SQLiteStore(dataDir);
    const adminToken=env.ADMIN_TOKEN||privateSecret(dataDir,'admin-token.txt',24);
    const sessionSecret=privateSecret(dataDir,'session-secret.txt',32);
    const identitySecret=privateSecret(dataDir,'voter-secret.txt',32);
    engine=new PlaybackEngine(store,{clock,identitySecret});
    const titleQueue=new TitleMetadataQueue(engine,{resolver:titleResolver});
    const scheduleTitles=()=>titleQueue.enqueue([engine.state.current,...engine.allQueued(),...engine.state.suggestions].filter(Boolean).map(v=>v.videoId));
    const chatAdmin=new ChatAdminDispatcher(engine,{onCatalogChange:scheduleTitles});
    const twitch=new TwitchConnector(engine,{env,adminDispatcher:chatAdmin});
    const kick=new KickConnector(engine,{adminDispatcher:chatAdmin});
    const soop=new SoopConnector(engine,{env,dataDir,adminDispatcher:chatAdmin});
    if(twitchEnabled)twitch.start();
    if(chatEnabled){kick.start();soop.start();}
    const logins=new Map(), publicRates=new Map();
    let worker=null,extracting=false;
    const overlayPresentation=new OverlayPresentation(engine.state.current,clock);
    const playlistPreviews=new Map(),activeExtracts=new Set();
    function prunePreviews(){
      for(const [id,p] of playlistPreviews)if(p.expiresAt<clock())playlistPreviews.delete(id);
      while(playlistPreviews.size>3)playlistPreviews.delete(playlistPreviews.keys().next().value);
    }
    function limited(req,action,max=25,windowMs=60000){
      const k=`${req.socket.remoteAddress}:${action}`,now=clock(),current=publicRates.get(k)||{count:0,since:now};
      if(now-current.since>windowMs){current.since=now;current.count=0;}
      current.count++;publicRates.set(k,current);if(current.count>max)throw Object.assign(new Error('Rate limit exceeded'),{status:429});
      if(publicRates.size>2500)for(const [key,rate]of publicRates)if(now-rate.since>windowMs)publicRates.delete(key);
    }
    function viewerKey(req,res){
      const c=readCookies(req).pb_viewer;
      if(c){const p=c.split('.');if(p.length===2&&/^[a-f0-9]{32}$/.test(p[0])&&timingEqual(signCookie(p[0],identitySecret),p[1]))return engine.hashViewer('web',p[0]);}
      const id=crypto.randomBytes(16).toString('hex');
      res.setHeader('Set-Cookie',`pb_viewer=${id}.${signCookie(id,identitySecret)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`);
      return engine.hashViewer('web',id);
    }
    function auth(req){return validSession(readCookies(req).pb_session,sessionSecret);}
    function requireAuth(req){if(!auth(req))throw Object.assign(new Error('Operator login required'),{status:401});}
    function workerAuth(req,payload){
      if(!isLocal(req.socket.remoteAddress))throw Object.assign(new Error('Worker must run on station localhost'),{status:403});
      if(!worker||worker.id!==payload.workerId||worker.expiresAt<clock())throw Object.assign(new Error('Worker lease expired'),{status:409});
      worker.expiresAt=clock()+12000;
    }
    function checkOrigin(req){
      if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return;
      const origin=req.headers.origin;
      if(origin){let o;try{o=new URL(origin);}catch{throw Object.assign(new Error('Bad origin'),{status:403});}
        if(o.host!==req.headers.host||!['http:','https:'].includes(o.protocol))throw Object.assign(new Error('Cross-site request rejected'),{status:403});
      }
    }
    let closing=false;
    const server=http.createServer(async(req,res)=>{
      if(closing)return json(res,503,{error:'Station is shutting down'});
      const url=new URL(req.url||'/','http://local.invalid');
      try {
        if(!isLocal(req.socket.remoteAddress)&&env.ALLOW_REMOTE!=='1')throw Object.assign(new Error('Local access only'),{status:403});
        if(!isLocal(req.socket.remoteAddress) && env.ALLOW_REMOTE==='1' && req.socket.encrypted!==true){
          throw Object.assign(new Error('Remote plaintext access is disabled; use a reverse proxy on the local interface'),{status:403});
        }
        let hostName='';try{hostName=new URL(`http://${req.headers.host||''}`).hostname.replace(/\[|\]/g,'').toLowerCase();}catch{}
        if(!['127.0.0.1','localhost','::1'].includes(hostName) && !env.PUBLIC_HOST?.split(',').map(x=>x.trim().toLowerCase()).includes(hostName))throw Object.assign(new Error('Untrusted hostname'),{status:403});
        checkOrigin(req);
        if(url.pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,app:'fKey Playback',version:VERSION,storage:'sqlite',queueLimit:null,uptimeSeconds:Math.floor(process.uptime()),workerActive:!!worker&&worker.expiresAt>clock()});
        if(url.pathname==='/api/overlay'&&req.method==='GET'){
          const snapshot=engine.publicState({compact:true});
          snapshot.current=overlayPresentation.snapshot(engine.state,worker?.displaySync===true&&worker.expiresAt>clock());
          return json(res,200,snapshot);
        }
        if(url.pathname==='/api/public'&&req.method==='GET')return json(res,200,engine.publicState({compact:url.searchParams.get('compact')==='1'}));
        if(url.pathname==='/api/session'&&req.method==='GET')return json(res,200,{authenticated:auth(req)});
        if(url.pathname==='/api/login'&&req.method==='POST'){
          limited(req,'login',8,60000);const b=await body(req);
          if(typeof b.token!=='string'||!timingEqual(b.token,adminToken))return json(res,401,{error:'Invalid operator token'});
          const duration=b.remember===true?REMEMBER_MS:SESS_MS;
          const cookie=loginSession(sessionSecret,duration);const secure=req.socket.encrypted||req.headers['x-forwarded-proto']==='https';
          return json(res,200,{ok:true},{'Set-Cookie':`pb_session=${cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${duration/1000}${secure?'; Secure':''}`});
        }
        if(url.pathname==='/api/logout'&&req.method==='POST')return json(res,200,{ok:true},{'Set-Cookie':'pb_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
        if(url.pathname==='/api/operator'&&req.method==='GET'){
          requireAuth(req);return json(res,200,{...(url.searchParams.get('compact')==='1'?engine.dashboardState(url.searchParams.get('catalog')):engine.operatorState()),twitch:twitch.status,kick:kick.status,soop:soop.status,chatAdminActivity:chatAdmin.adminActivity,workerActive:!!worker&&worker.expiresAt>clock()});
        }
        if(url.pathname==='/api/shutdown'&&req.method==='POST'){
          requireAuth(req);
          const payload=await body(req);
          if(payload.confirm!==true)throw new Error('Confirm station shutdown');
          res.once('finish',()=>{
            close().catch(error=>{console.error('Station shutdown failed:',error.message);process.exitCode=1;});
          });
          return json(res,202,{ok:true});
        }
        if(url.pathname==='/api/playlist/extract'&&req.method==='POST'){
          requireAuth(req);limited(req,'playlist-extract',8,60000);
          const b=await body(req);
          const parsed=parsePlaylistUrl(b.url),window=playlistWindow(b.start??1,b.limit??250);
          if(extracting)throw Object.assign(new Error('An extraction is already running; please wait'),{status:409});
          extracting=true;
          const controller=new AbortController();activeExtracts.add(controller);
          const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.once('close',disconnected);
          try{
            const raw=await playlistExtractor(parsed.url,{start:window.start,limit:window.limit,env,signal:controller.signal});
            if(controller.signal.aborted)return;
            // Validate provider results again: no untrusted metadata reaches the saved queue.
            const prepared=normalizePlaylist({title:raw.title,entries:raw.videos,total:raw.total},
              {playlistId:parsed.playlistId,start:window.start,limit:window.limit,provider:raw.provider||'extractor'});
            prepared.hasMore=typeof raw.hasMore==='boolean'?raw.hasMore:prepared.hasMore;
            prepared.unavailable+=Number.isInteger(raw.unavailable)&&raw.unavailable>=0?raw.unavailable:0;
            prunePreviews();const id=crypto.randomUUID();
            playlistPreviews.set(id,{videos:prepared.videos,expiresAt:clock()+15*60*1000});
            return json(res,200,{id,...prepared});
          }finally{extracting=false;res.off('close',disconnected);activeExtracts.delete(controller);}
        }
        if(url.pathname==='/api/playlist/import'&&req.method==='POST'){
          requireAuth(req);limited(req,'playlist-import',15,60000);
          const b=await body(req);prunePreviews();const preview=typeof b.id==='string'?playlistPreviews.get(b.id):null;
          if(!preview)throw Object.assign(new Error('Playlist preview expired. Extract the playlist again.'),{status:410});
          if(!Array.isArray(b.indexes)||b.indexes.length>500||!b.indexes.length)throw new Error('Select at least one video to import');
          const unique=new Set(b.indexes);
          if(unique.size!==b.indexes.length||[...unique].some(n=>!Number.isInteger(n)||n<0||n>=preview.videos.length))throw new Error('Invalid playlist selection');
          if(b.skipDuplicates!==undefined&&typeof b.skipDuplicates!=='boolean')throw new Error('Invalid duplicate option');
          const selected=preview.videos.filter((_,i)=>unique.has(i));
          const result=engine.importPlaylist(selected,{skipDuplicates:b.skipDuplicates!==false,destination:b.destination??'current',order:b.order??'original'});
          scheduleTitles();
          return json(res,200,{ok:true,...result});
        }
        if(url.pathname==='/api/settings'&&req.method==='POST'){
          requireAuth(req);const b=await body(req);const result=engine.saveSettings(b.settings);
          if(result.changedTwitch&&twitchEnabled)twitch.reconfigure();
          if(chatEnabled){if(result.changedKick)kick.reconfigure();if(result.changedSoop)soop.reconfigure();}
          return json(res,200,{ok:true,revision:engine.state.layoutRevision});
        }
        if(url.pathname==='/api/control'&&req.method==='POST'){
          requireAuth(req);limited(req,'control',180);const b=await body(req);let result=null;
          switch(b.action){
            case 'add':result=engine.add(b.url,b.title,{now:b.now===true,front:b.front===true,destination:b.destination??'current'});break;
            case 'bulk':result=engine.bulkAdd(b.lines,{destination:b.destination??'current'});break;
            case 'skip':engine.skip();break;
            case 'startVote':engine.startVote();break;
            case 'cancelVote':engine.cancelVote();break;
            case 'replay':engine.replay();break;
            case 'previous':engine.previous();break;
            case 'play':engine.pause(false);break;
            case 'pause':engine.pause(true);break;
            case 'seek':engine.seek(b.position);break;
            case 'audio':result=engine.setAudio(b.volume,b.muted);break;
            case 'reconnectChat':
              if(!['kick','soop'].includes(b.platform))throw new Error('Invalid chat platform');
              if(!chatEnabled)throw new Error('Chat readers are disabled in this runtime');
              (b.platform==='kick'?kick:soop).reconfigure();break;
            case 'playNow':engine.playNow(b.id);break;
            case 'remove':engine.remove(b.id);break;
            case 'reorder':engine.reorder(b.id,b.to);break;
            case 'move':result=engine.move(b.id,b.destination);break;
            case 'moveMany':result=engine.moveMany(b.ids,b.destination);break;
            case 'sortUpcoming':result=engine.sortUpcoming(b.order);break;
            case 'sortRecycled':result=engine.sortRecycled(b.order);break;
            case 'choose':engine.choose(b.choice);break;
            case 'moderate':engine.moderate(b.id,b.approved===true);break;
            default:throw new Error('Unknown operator action');
          }
          if(['add','bulk','skip','playNow','previous','choose','moderate','move','moveMany'].includes(b.action))scheduleTitles();
          return json(res,200,{ok:true,result});
        }
        if(url.pathname==='/api/vote'&&req.method==='POST'){
          limited(req,'vote',20);const b=await body(req);
          return json(res,200,{counts:engine.voteChoice(b.choice,viewerKey(req,res))});
        }
        if(url.pathname==='/api/skip-vote'&&req.method==='POST'){
          limited(req,'skip-vote',20);return json(res,200,{count:engine.skipVote(viewerKey(req,res))});
        }
        if(url.pathname==='/api/suggestion'&&req.method==='POST'){
          limited(req,'suggestion',5);const b=await body(req);const id=engine.suggest(b.url,b.title,viewerKey(req,res));scheduleTitles();return json(res,200,{id});
        }
        if(url.pathname==='/api/worker/claim'&&req.method==='POST'){
          if(!isLocal(req.socket.remoteAddress))throw Object.assign(new Error('Worker local only'),{status:403});
          const b=await body(req);const id=typeof b.workerId==='string'&&/^[0-9a-f-]{36}$/i.test(b.workerId)?b.workerId:crypto.randomUUID();
          if(worker?.expiresAt>clock()&&worker.id!==id)throw Object.assign(new Error('Another OBS output currently owns playback'),{status:409});
          worker={id,expiresAt:clock()+12000,displaySync:b.displaySync===true};return json(res,200,{workerId:id,generation:engine.state.generation});
        }
        if(url.pathname==='/api/worker/release'&&req.method==='POST'){
          const b=await body(req);workerAuth(req,b);worker=null;
          return json(res,200,{ok:true});
        }
        if(url.pathname==='/api/worker/display'&&req.method==='POST'){
          const b=await body(req);workerAuth(req,b);
          return json(res,200,{accepted:overlayPresentation.acknowledge(engine.state,b)});
        }
        if(url.pathname==='/api/worker/progress'&&req.method==='POST'){
          const b=await body(req);workerAuth(req,b);
          return json(res,200,{accepted:engine.updatePosition(b.generation,b.position,b.duration,b.title,b.videoId)});
        }
        if(url.pathname==='/api/worker/ended'&&req.method==='POST'){
          const b=await body(req);workerAuth(req,b);const accepted=engine.ended(b.generation);if(accepted)scheduleTitles();return json(res,200,{accepted});
        }
        if(url.pathname==='/api/worker/error'&&req.method==='POST'){
          const b=await body(req);workerAuth(req,b);
          // Cached/older output pages can still report errors automatically.
          // Account restrictions must not quarantine a saved queue entry.
          if(engine.settings.youtubeAccountPlayback)return json(res,200,{ok:true,held:true});
          if(b.generation===engine.state.generation && engine.state.current && !engine.state.vote){engine.failVideo();scheduleTitles();}
          return json(res,200,{ok:true});
        }
        if(url.pathname==='/api/worker/layout-ack'&&req.method==='POST'){
          const b=await body(req);workerAuth(req,b);
          if(!Number.isInteger(b.layoutRevision))throw new Error('Invalid layout version');
          engine.outputAck(b.workerId,b.layoutRevision,{clean:b.clean});return json(res,200,{ok:true});
        }
        if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'},{'Allow':'GET, HEAD'});
        const routing={'/':'control.html','/control':'control.html','/settings':'settings.html','/vote':'vote.html','/player':'player.html','/overlay':'overlay.html','/youtube-setup':'youtube-setup.html','/obs-setup':'obs-setup.html'};
        const file=routing[url.pathname]||(url.pathname.startsWith('/assets/')?url.pathname.slice(1):null);
        if(!file)return json(res,404,{error:'Not found'});
        const absolute=path.resolve(PUBLIC,file);
        if(!absolute.startsWith(PUBLIC+path.sep))return json(res,404,{error:'Not found'});
        let stat;try{stat=fs.statSync(absolute);}catch{return json(res,404,{error:'Not found'});}
        if(!stat.isFile())return json(res,404,{error:'Not found'});
        res.writeHead(200,{...secureHeaders,'Content-Type':MIME[path.extname(absolute)]||'application/octet-stream','Cache-Control':path.extname(absolute)==='.html'?'no-store':'public, max-age=300'});
        if(req.method==='HEAD')return res.end();fs.createReadStream(absolute).pipe(res);
      }catch(e){json(res,e.status||(e.message?.startsWith('Invalid')||e.message?.startsWith('Unknown')?400:400),{error:e.message||'Request failed'});}
    });
    const ticker=setInterval(()=>engine.tick(),250);
    let workStopped=false,cleaned=false,closePromise;
    const stopWork=()=>{if(workStopped)return;workStopped=true;clearInterval(ticker);for(const c of activeExtracts)c.abort();playlistPreviews.clear();titleQueue.close();twitch.stop();kick.stop();soop.stop();};
    const cleanup=()=>{if(cleaned)return;cleaned=true;stopWork();try{store.close();}finally{release();}};
    const close=()=>{
      if(closePromise)return closePromise;
      closing=true;stopWork();
      closePromise=new Promise((resolve,reject)=>{
        const deadline=setTimeout(()=>server.closeAllConnections(),1500);deadline.unref?.();
        server.close(error=>{
          clearTimeout(deadline);
          try{cleanup();}catch(e){reject(e);return;}
          if(error && error.code!=='ERR_SERVER_NOT_RUNNING')reject(error);else resolve();
        });
        server.closeIdleConnections?.();
      });
      return closePromise;
    };
    return {server,engine,twitch,kick,soop,chatAdmin,cleanup,listen:(listenPort=port,listenHost=host)=>new Promise((resolve,reject)=>{
      server.once('error',reject);server.listen(listenPort,listenHost,()=>{server.removeListener('error',reject);resolve(server.address());});
    }),close};
  }catch(e){try{store?.close();}finally{release();}throw e;}
}

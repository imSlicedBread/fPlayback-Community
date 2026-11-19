import {$,e,api,applyTheme,applyLowerThird,showNotice,initAuth} from './common.js?v=1.5.1';
import {renderVoteScreen} from './vote-screen.js';
import {setupStationUpdates} from './station-update.js';
const refreshUpdates=setupStationUpdates();
const boolKeys=['loop','voteOnEnd','showLowerThird','scrollTitles','hideCaptions','skipVoting','allowSuggestions','youtubeAccountPlayback'];
const defaultColors={background:'#0D1010',panel:'#111318',raised:'#171A1F',accent:'#00AFFF',text:'#FFFFFF',healthy:'#22C55E',warning:'#F59E0B',error:'#EF4444',info:'#3B82F6',community:'#8B5CF6'};
const presetColors={cyan:defaultColors,purple:{...defaultColors,accent:'#8B5CF6'},green:{...defaultColors,accent:'#22C55E'},amber:{...defaultColors,accent:'#F59E0B'}};
const ltDefault={x:3,y:0,width:34,height:0,backgroundOpacity:89,scale:100,titleScale:100,anchor:'bottom',showChannelLabel:false,showNowPlaying:false,showDuration:false,showSkip:false};
const voteDefault={heading:'UP NEXT',instruction:'!vote 1-4 in Twitch chat',cardGap:20,panelOpacity:94,showThumbnails:true,showCountdown:true,showVotes:true,accentBorders:true};
let saved=null,draft=null,lastStatus=null,applying=false;
const clone=x=>JSON.parse(JSON.stringify(x));
function tab(name){
  for(const el of document.querySelectorAll('[data-tab]')){const active=el.dataset.tab===name;el.classList.toggle('active',active);el.setAttribute('aria-selected',active?'true':'false');}
  for(const el of document.querySelectorAll('[data-panel]'))el.classList.toggle('hidden',el.dataset.panel!==name);
  document.querySelector('.settings-footer').classList.toggle('hidden',name==='updates');
}
for(const el of document.querySelectorAll('[data-tab]'))el.addEventListener('click',()=>{tab(el.dataset.tab);if(el.dataset.tab==='lowerthird')requestAnimationFrame(updatePreview);});
function number(id){return Number($(id).value);}
function readDraft(){
  if(!draft)return;
  draft.channelLabel=$('channelLabel').value;
  for(const k of boolKeys)draft[k]=$(k).checked;
  draft.voteSeconds=number('voteSeconds');draft.skipThreshold=number('skipThreshold');
  draft.twitchChannel=$('twitchChannel').value.trim();draft.twitchMode=$('twitchMode').value;
  draft.twitchAdminWhitelist=[...new Set($('twitchAdminWhitelist').value.split(/[,\r\n]+/).map(name=>name.trim()).filter(Boolean).map(name=>name.replace(/^@/,'').toLowerCase()))];
  for(const platform of ['kick','soop']){
    draft[platform+'Enabled']=$(platform+'Enabled').checked;
    draft[platform+'Channel']=$(platform+'Channel').value.trim().replace(/^@/,'').toLowerCase();
    draft[platform+'AdminWhitelist']=[...new Set($(platform+'AdminWhitelist').value.split(/[,\r\n]+/).map(name=>name.trim()).filter(Boolean).map(name=>name.replace(/^@/,'').toLowerCase()))];
  }
  draft.kickChatroomId=$('kickChatroomId').value.trim();
  draft.lowerThird={x:number('ltX'),y:number('ltY'),width:number('ltWidth'),height:number('ltHeight'),backgroundOpacity:number('ltOpacity'),scale:number('ltScale'),titleScale:number('ltTitleScale'),anchor:$('ltAnchor').value,showChannelLabel:$('ltShowChannel').checked,showNowPlaying:$('ltShowNowPlaying').checked,showDuration:$('ltShowDuration').checked,showSkip:$('ltShowSkip').checked};
  draft.voteScreen={heading:$('vsHeading').value,instruction:$('vsInstruction').value,cardGap:number('vsGap'),panelOpacity:number('vsOpacity'),showThumbnails:$('vsThumbs').checked,showCountdown:$('vsCountdown').checked,showVotes:$('vsVotes').checked,accentBorders:$('vsBorders').checked};
  for(const [key]of Object.entries(defaultColors))draft.colors[key]=$(`colorHex_${key}`).value;
}
function populate(){
  if(!draft)return;applying=true;
  $('channelLabel').value=draft.channelLabel;
  for(const k of boolKeys)$(k).checked=draft[k];
  $('voteSeconds').value=draft.voteSeconds;$('skipThreshold').value=draft.skipThreshold;
  $('twitchChannel').value=draft.twitchChannel;$('twitchMode').value=draft.twitchMode;
  $('twitchAdminWhitelist').value=(draft.twitchAdminWhitelist||[]).join('\n');
  for(const platform of ['kick','soop']){
    $(platform+'Enabled').checked=draft[platform+'Enabled']===true;
    $(platform+'Channel').value=draft[platform+'Channel']||'';
    $(platform+'AdminWhitelist').value=(draft[platform+'AdminWhitelist']||[]).join('\n');
  }
  $('kickChatroomId').value=draft.kickChatroomId||'';
  populateLower();
  const vs=draft.voteScreen;
  $('vsHeading').value=vs.heading;$('vsInstruction').value=vs.instruction;$('vsGap').value=vs.cardGap;$('vsOpacity').value=vs.panelOpacity;
  $('vsThumbs').checked=vs.showThumbnails;$('vsCountdown').checked=vs.showCountdown;$('vsVotes').checked=vs.showVotes;$('vsBorders').checked=vs.accentBorders;
  for(const key of Object.keys(defaultColors)){ $(`colorHex_${key}`).value=draft.colors[key];$(`colorPick_${key}`).value=draft.colors[key]; }
  applying=false;updatePreview();
}
function populateLower(){
  for(const [key,id]of Object.entries({x:'ltX',y:'ltY',width:'ltWidth',height:'ltHeight',scale:'ltScale'}))$(id).value=Math.round(draft.lowerThird[key]*10)/10;
  $('ltAnchor').value=draft.lowerThird.anchor;
  $('ltTitleScale').value=draft.lowerThird.titleScale;$('ltTitleScaleValue').textContent=`${draft.lowerThird.titleScale}%`;
  $('ltOpacity').value=draft.lowerThird.backgroundOpacity;$('ltOpacityValue').textContent=`${draft.lowerThird.backgroundOpacity}%`;
  for(const [key,id] of Object.entries({showChannelLabel:'ltShowChannel',showNowPlaying:'ltShowNowPlaying',showDuration:'ltShowDuration',showSkip:'ltShowSkip'}))$(id).checked=draft.lowerThird[key];
}
function updatePreview(){
  if(!draft)return;
  applyTheme(draft.colors);
  const lt=draft.lowerThird,card=$('previewCard');
  applyLowerThird(card,lt,{preview:true});
  card.querySelector('.topline span').textContent=draft.channelLabel||'fKey Playback';
  $('lowerReadout').textContent=`X: ${lt.x}% · ${lt.anchor.toUpperCase()}: ${lt.y}% · WIDTH: ${lt.width}% · HEIGHT: ${lt.height?`${lt.height}%`:'AUTO'} · OPACITY: ${lt.backgroundOpacity}% · SCALE: ${lt.scale}% · TITLE: ${lt.titleScale}%`;
  const handle=$('resizeHandle');
  handle.setAttribute('aria-valuenow',String(lt.height || 0));
  handle.setAttribute('aria-valuetext',`${lt.width}% wide; ${lt.height?`${lt.height}%`:'auto'} high`);
  $('ltOpacityValue').textContent=`${lt.backgroundOpacity}%`;
  $('ltTitleScaleValue').textContent=`${lt.titleScale}%`;
  $('voteReadout').textContent=`GAP ${draft.voteScreen.cardGap}px  ·  PANEL ${draft.voteScreen.panelOpacity}%`;
  renderVoteScreen($('votePreview'),null,draft,{preview:true});
}
function dirty(){if(applying||!draft)return;readDraft();updatePreview();showNotice('saveState','Unsaved changes — click Save Settings to update OBS.','');}
function buildColors(){
  const inputs=$('colorInputs');inputs.replaceChildren();
  for(const [key,value]of Object.entries(defaultColors)){
    const pick=e('input',{type:'color',id:`colorPick_${key}`});pick.value=value;
    const hex=e('input',{type:'text',id:`colorHex_${key}`,maxlength:'7'});hex.value=value;
    pick.addEventListener('input',()=>{hex.value=pick.value;dirty();});
    hex.addEventListener('input',()=>{if(/^#[0-9a-f]{6}$/i.test(hex.value))pick.value=hex.value;dirty();});
    inputs.append(e('div',{class:'color-item'},pick,e('span',{text:key.toUpperCase()}),hex));
  }
}
function connectFields(){
  for(const platform of ['kick','soop'])$(platform+'Reconnect').addEventListener('click',async()=>{
    const button=$(platform+'Reconnect');button.disabled=true;
    try{await api('control',{method:'POST',data:{action:'reconnectChat',platform}});await updateStatus();}
    catch(error){$(platform+'Connection').textContent=error.message;}
    finally{button.disabled=false;}
  });
  for(const id of ['channelLabel',...boolKeys,'voteSeconds','skipThreshold','twitchChannel','twitchMode','twitchAdminWhitelist','kickEnabled','kickChannel','kickChatroomId','kickAdminWhitelist','soopEnabled','soopChannel','soopAdminWhitelist','ltX','ltY','ltWidth','ltHeight','ltScale','ltTitleScale','ltOpacity','ltAnchor','ltShowChannel','ltShowNowPlaying','ltShowDuration','ltShowSkip','vsHeading','vsInstruction','vsGap','vsOpacity','vsThumbs','vsCountdown','vsVotes','vsBorders']){
    const el=$(id);el.addEventListener('input',dirty);el.addEventListener('change',dirty);
  }
  for(const button of document.querySelectorAll('[data-preset]'))button.addEventListener('click',()=>{
    readDraft();draft.colors=clone(presetColors[button.dataset.preset]);populate();showNotice('saveState','New palette previewed. Save to broadcast.','');
  });
  $('resetColors').addEventListener('click',()=>{readDraft();draft.colors=clone(defaultColors);populate();dirty();});
  $('resetLower').addEventListener('click',()=>{readDraft();draft.lowerThird=clone(ltDefault);populate();dirty();});
  $('ltAutoHeight').addEventListener('click',()=>{readDraft();draft.lowerThird.height=0;populateLower();dirty();});
  $('resetVote').addEventListener('click',()=>{readDraft();draft.voteScreen=clone(voteDefault);populate();dirty();});
  $('snapBottom').addEventListener('click',()=>{readDraft();draft.lowerThird.anchor='bottom';draft.lowerThird.y=0;populate();dirty();});
  $('snapTop').addEventListener('click',()=>{readDraft();draft.lowerThird.anchor='top';draft.lowerThird.y=0;populate();dirty();});
  $('discard').addEventListener('click',()=>{if(saved){draft=clone(saved);populate();showNotice('saveState','Unsaved changes discarded.','');}});
  $('save').addEventListener('click',async()=>{
    try{readDraft();const submitted=clone(draft);$('save').disabled=true;const response=await api('settings',{method:'POST',data:{settings:submitted}});
      saved=submitted;
      for(const platform of ['twitch','kick','soop']){
        const key=platform+'AdminWhitelist';
        if(JSON.stringify(draft[key])===JSON.stringify(saved[key]))$(key).value=saved[key].join('\n');
      }
      showNotice('saveState',`Settings saved — layout revision ${response.revision}.`,'success');await updateStatus();}
    catch(e){showNotice('saveState',e.message,'error');}finally{$('save').disabled=false;}
  });
}
// Pixel geometry is measured against the 16:9 editor frame. Both OBS and preview
// use percentage layout coordinates, so dragging/resizing is resolution-independent.
function setupDrag(){
  const frame=$('lowerPreview'),card=$('previewCard'),handle=$('resizeHandle');
  let start=null;
  const round=x=>Math.round(x*10)/10;
  const bounds=()=>({width:Math.max(1,frame.clientWidth),height:Math.max(1,frame.clientHeight)});
  const displayedHeight=()=>round(card.getBoundingClientRect().height/bounds().height*100);
  const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
  function changed(message='Unsaved lower-third layout. Save to update OBS.'){
    populateLower();updatePreview();showNotice('saveState',message,'');
  }
  card.addEventListener('pointerdown',ev=>{
    if(ev.target===handle||!draft)return;
    ev.preventDefault();card.setPointerCapture(ev.pointerId);readDraft();
    start={kind:'move',clientX:ev.clientX,clientY:ev.clientY,lt:clone(draft.lowerThird),height:displayedHeight()};
  });
  handle.addEventListener('pointerdown',ev=>{
    if(!draft)return;
    ev.preventDefault();ev.stopPropagation();handle.setPointerCapture(ev.pointerId);readDraft();
    start={kind:'resize',clientX:ev.clientX,clientY:ev.clientY,lt:clone(draft.lowerThird),
      height:draft.lowerThird.height || clamp(displayedHeight(),4,65)};
  });
  function move(ev){
    if(!start)return;
    const size=bounds();
    const dx=(ev.clientX-start.clientX)/size.width*100;
    const dy=(ev.clientY-start.clientY)/size.height*100;
    const lt=clone(start.lt);
    if(start.kind==='resize'){
      lt.width=round(clamp(lt.width+dx,15,Math.min(90,100-lt.x)));
      // The resize handle is top-right for bottom anchoring, and bottom-right
      // for top anchoring. The opposite edge stays fixed while resizing.
      const change=lt.anchor==='bottom'?-dy:dy;
      lt.height=round(clamp(start.height+change,4,Math.min(65,100-lt.y)));
    }else{
      lt.x=round(clamp(lt.x+dx,0,100-lt.width));
      const maxMargin=Math.max(0,Math.min(94,100-start.height));
      lt.y=round(clamp(lt.y+(lt.anchor==='bottom'?-dy:dy),0,maxMargin));
    }
    draft.lowerThird=lt;changed();
  }
  card.addEventListener('pointermove',ev=>{if(start?.kind==='move')move(ev);});
  handle.addEventListener('pointermove',ev=>{if(start?.kind==='resize')move(ev);});
  const end=()=>{start=null;};
  card.addEventListener('pointerup',end);card.addEventListener('pointercancel',end);
  handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  card.addEventListener('keydown',ev=>{
    if(!draft||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key))return;
    ev.preventDefault();readDraft();
    const step=ev.shiftKey?5:1,lt=draft.lowerThird;
    const maxMargin=Math.min(94,100-(lt.height||displayedHeight()));
    if(ev.key==='ArrowLeft')lt.x=round(clamp(lt.x-step,0,100-lt.width));
    if(ev.key==='ArrowRight')lt.x=round(clamp(lt.x+step,0,100-lt.width));
    if(ev.key==='ArrowUp')lt.y=round(clamp(lt.y+(lt.anchor==='bottom'?step:-step),0,Math.max(0,maxMargin)));
    if(ev.key==='ArrowDown')lt.y=round(clamp(lt.y+(lt.anchor==='bottom'?-step:step),0,Math.max(0,maxMargin)));
    changed();
  });
  handle.addEventListener('keydown',ev=>{
    if(!draft||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key))return;
    ev.stopPropagation();ev.preventDefault();readDraft();
    const lt=draft.lowerThird,step=ev.shiftKey?5:1;
    if(ev.key==='ArrowLeft'||ev.key==='ArrowRight'){
      lt.width=round(clamp(lt.width+(ev.key==='ArrowRight'?step:-step),15,Math.min(90,100-lt.x)));
    }else{
      const height=lt.height||clamp(displayedHeight(),4,65);
      lt.height=round(clamp(height+(ev.key==='ArrowUp'?step:-step),4,Math.min(65,100-lt.y)));
    }
    changed('Unsaved lower-third dimensions. Save to update OBS.');
  });
}
let activityKey='';
function drawAdminActivity(activity=[]){
  const key=JSON.stringify(activity);if(key===activityKey)return;activityKey=key;
  const rows=$('chatAdminActivity');rows.replaceChildren();
  for(const item of activity){
    const timestamp=new Date(item.timestamp);
    rows.append(e('tr',{},e('td',{},e('time',{datetime:item.timestamp,text:timestamp.toLocaleTimeString()})),e('td',{text:({twitch:'Twitch',kick:'Kick',soop:'SOOP'})[item.platform]||'Twitch'}),
      e('td',{text:item.username}),e('td',{},e('code',{text:item.command})),
      e('td',{class:item.success?'chat-admin-success':'chat-admin-error',text:`${item.success?'Success':'Error'} — ${item.result}`})));
  }
  if(!activity.length)rows.append(e('tr',{},e('td',{colspan:5,text:'No chat admin commands since server startup.'})));
}
async function updateStatus(){
  if(!saved)return;
  try{
    const s=await api('operator?compact=1&catalog=omit');lastStatus=s;
    $('twitchConnection').textContent=`${s.twitch.state} / ${s.twitch.mode.toUpperCase()}${s.twitch.channel?' / #'+s.twitch.channel:''}${s.twitch.detail?' — '+s.twitch.detail:''}`;
    drawAdminActivity(s.chatAdminActivity);
    for(const platform of ['kick','soop']){
      const status=s[platform]||{state:'DISABLED',detail:''};
      $(platform+'Connection').textContent=`${status.state}${status.channel?' / '+status.channel:''}${status.detail?' — '+status.detail:''}`;
    }
    const outputs=s.outputs||[];
    let status='Waiting for connected OBS output';
    if(outputs.some(x=>x.layoutRevision>=s.layoutRevision&&!x.clean&&s.settings.showLowerThird))status='Applied in connected output page';
    else if(outputs.some(x=>x.clean))status='Output connected in clean mode (lower third hidden)';
    else if(outputs.some(x=>x.layoutRevision<s.layoutRevision))status='Connected output uses older layout';
    else if(outputs.length&&!s.settings.showLowerThird)status='Output connected; lower third disabled';
    $('outputStatus').textContent=status;
    $('syncState').textContent=`Server layout revision ${s.layoutRevision}. Output acknowledgment confirms loaded settings, not OBS display visibility.`;
  }catch(e){if(e.status===401)$('auth').classList.remove('hidden');}
}
async function load(){const state=await api('operator?compact=1&catalog=omit');saved=clone(state.settings);draft=clone(state.settings);populate();void refreshUpdates();await updateStatus();}
buildColors();connectFields();setupDrag();
if('ResizeObserver' in window)new ResizeObserver(()=>{if(draft&&!$('lowerPreview').closest('.hidden'))updatePreview();}).observe($('lowerPreview'));
await initAuth(load);setInterval(()=>{if($('auth').classList.contains('hidden'))updateStatus();},2500);

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeSettings,validateSettings} from '../lib/config.js';

// Run the shipped Settings controller against a small DOM adapter. This tests
// its actual event handlers and polling without a browser or external services.
class Element {
  value='';checked=false;textContent='';children=[];listeners=new Map();attributes={};
  classList={contains:()=>false,toggle:()=>{},add:()=>{},remove:()=>{}};
  addEventListener(type,listener){this.listeners.set(type,listener);}
  async fire(type){await this.listeners.get(type)?.({preventDefault(){}});}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(name,value){this.attributes[name]=value;}
  querySelector(){return new Element();}
}
async function settingsHarness(){
  const html=fs.readFileSync(new URL('../public/settings.html',import.meta.url),'utf8');
  const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
  const $=id=>{assert.ok(elements.has(id),`Missing Settings element: ${id}`);return elements.get(id);};
  const e=(tag,attributes={},...children)=>{
    const element=new Element();element.tag=tag;
    if(attributes.id)elements.set(attributes.id,element);
    for(const [key,value] of Object.entries(attributes))if(key==='text')element.textContent=value;else element.setAttribute(key,value);
    element.append(...children);return element;
  };
  let saved=normalizeSettings({twitchAdminWhitelist:['alice']}),activity=[],failSave=false,posts=0,reconnects=[];
  const api=async(route,options={})=>{
    if(route==='control'){assert.equal(options.data.action,'reconnectChat');reconnects.push(options.data.platform);return {ok:true};}
    if(route==='settings'){
      posts++;if(failSave)throw new Error('Could not persist state');
      saved=validateSettings(options.data.settings);return {revision:2};
    }
    assert.equal(route,'operator?compact=1&catalog=omit');
    return {settings:structuredClone(saved),twitch:{state:'DISABLED',mode:'disabled'},outputs:[],layoutRevision:1,chatAdminActivity:activity};
  };
  const script=fs.readFileSync(new URL('../public/assets/settings.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  const context={$,e,api,document:{querySelectorAll:()=>[]},window:{},applyTheme(){},applyLowerThird(){},renderVoteScreen(){},setupStationUpdates:()=>()=>{},
    showNotice:(id,message)=>{$(id).textContent=message;},initAuth:async load=>load(),setInterval(){}};
  const controller=await vm.runInNewContext(`(async()=>{${script}\nreturn {updateStatus};})()`,context);
  return {$,controller,html,get saved(){return saved;},get posts(){return posts;},get reconnects(){return reconnects;},set activity(value){activity=value;},set failSave(value){failSave=value;}};
}

test('Settings whitelist saves normalized usernames, discards edits, and survives activity polling',async()=>{
  const h=await settingsHarness();
  assert.equal(h.$('twitchAdminWhitelist').value,'alice');
  h.$('twitchAdminWhitelist').value=' @BOB, bob\nCarol_2';await h.$('twitchAdminWhitelist').fire('input');
  h.activity=[{id:1,timestamp:'2026-10-17T12:00:00.000Z',username:'alice',command:'!pause',success:true,result:'Applied'}];
  await h.controller.updateStatus();
  assert.equal(h.$('twitchAdminWhitelist').value,' @BOB, bob\nCarol_2','polling must not overwrite the draft');
  assert.equal(h.$('chatAdminActivity').children[0].children[2].textContent,'alice');
  await h.$('save').fire('click');
  assert.deepEqual(h.saved.twitchAdminWhitelist,['bob','carol_2']);assert.equal(h.$('twitchAdminWhitelist').value,'bob\ncarol_2');
  h.$('twitchAdminWhitelist').value='unsaved';await h.$('twitchAdminWhitelist').fire('input');
  await h.$('discard').fire('click');assert.equal(h.$('twitchAdminWhitelist').value,'bob\ncarol_2');
  h.$('twitchAdminWhitelist').value='';await h.$('save').fire('click');assert.deepEqual(h.saved.twitchAdminWhitelist,[]);
});

test('Settings failed saves preserve draft and saved access; activity uses text nodes and refreshes empty state',async()=>{
  const h=await settingsHarness();h.failSave=true;
  h.$('twitchAdminWhitelist').value='bob';await h.$('save').fire('click');
  assert.equal(h.posts,1);assert.deepEqual(h.saved.twitchAdminWhitelist,['alice']);assert.equal(h.$('twitchAdminWhitelist').value,'bob');
  assert.match(h.$('saveState').textContent,/Could not persist/);
  await h.$('discard').fire('click');assert.equal(h.$('twitchAdminWhitelist').value,'alice');
  h.activity=[{id:1,timestamp:'2026-10-17T12:00:00.000Z',username:'alice',command:'!add',success:false,result:'<img src=x onerror=alert(1)>'}];
  await h.controller.updateStatus();
  const result=h.$('chatAdminActivity').children[0].children[4];
  assert.equal(result.textContent,'Error — <img src=x onerror=alert(1)>');assert.deepEqual(result.children,[]);
  h.activity=[];await h.controller.updateStatus();
  assert.match(h.$('chatAdminActivity').children[0].children[0].textContent,/No chat admin commands/);
  assert.match(h.html,/settings\.js\?v=\d+\.\d+\.\d+/);
});

test('Kick and SOOP Settings save independent whitelists and keep edits intact while showing platform activity',async()=>{
  const h=await settingsHarness();
  h.$('kickEnabled').checked=true;h.$('kickChannel').value=' @Owner ';h.$('kickChatroomId').value='456';h.$('kickAdminWhitelist').value='@Alice-One, ALICE-one';
  h.$('soopEnabled').checked=true;h.$('soopChannel').value='soop_owner';h.$('soopAdminWhitelist').value='account_one\naccount_two';
  await h.$('soopAdminWhitelist').fire('input');
  h.activity=[{id:1,timestamp:'2026-10-18T12:00:00Z',platform:'soop',username:'account_one',command:'!pause',success:true,result:'Applied'}];
  await h.controller.updateStatus();assert.equal(h.$('soopAdminWhitelist').value,'account_one\naccount_two');
  assert.equal(h.$('chatAdminActivity').children[0].children[1].textContent,'SOOP');
  await h.$('kickReconnect').fire('click');await h.$('soopReconnect').fire('click');assert.deepEqual(h.reconnects,['kick','soop']);
  assert.equal(h.posts,0,'reconnect must not save unfinished settings');assert.equal(h.$('soopAdminWhitelist').value,'account_one\naccount_two');
  await h.$('save').fire('click');
  assert.deepEqual(h.saved.kickAdminWhitelist,['alice-one']);assert.deepEqual(h.saved.soopAdminWhitelist,['account_one','account_two']);assert.deepEqual(h.saved.twitchAdminWhitelist,['alice']);
  assert.equal(h.saved.kickChatroomId,'456');assert.equal(h.saved.kickChannel,'owner');
  h.$('soopAdminWhitelist').value='discard';await h.$('discard').fire('click');assert.equal(h.$('soopAdminWhitelist').value,'account_one\naccount_two');
});

test('OBS YouTube account setting saves/discards through normal Settings controls and preserves drafts during polling',async()=>{
 const h=await settingsHarness();assert.equal(h.$('youtubeAccountPlayback').checked,false);
 h.$('youtubeAccountPlayback').checked=true;await h.controller.updateStatus();assert.equal(h.$('youtubeAccountPlayback').checked,true,'activity refresh must keep the unsaved mode');
 await h.$('save').fire('click');assert.equal(h.saved.youtubeAccountPlayback,true);
 h.$('youtubeAccountPlayback').checked=false;await h.$('discard').fire('click');assert.equal(h.$('youtubeAccountPlayback').checked,true);
 h.failSave=true;h.$('youtubeAccountPlayback').checked=false;await h.$('save').fire('click');assert.equal(h.saved.youtubeAccountPlayback,true);assert.equal(h.$('youtubeAccountPlayback').checked,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=readFileSync(path.join(root,'public/assets/control.js'),'utf8');

test('Queue polling preserves mounted DOM rows and the native dropdown',()=>{
  const body=src.slice(src.indexOf('function drawQueue(s){'),src.indexOf("for(const tab of document.querySelectorAll('[data-queue-lane]'))tab.addEventListener"));
  assert.match(body,/const visible=new Set\(pageView\.items\.map\(\(\{video\}\)=>video\.id\)\)/);
  assert.match(body,/queueRows\.get\(video\.id\)/);
  assert.match(body,/row\.update\(video,index,activeQueueLane,list\.length\)/);
  assert.match(body,/container\.children\[slot\]!==row\.element/);
  assert.doesNotMatch(body,/replaceChildren\(\.\.\.list\.map/);
});

test('Destination dropdown is never reset by an ordinary polling update',()=>{
  const body=src.slice(src.indexOf('function makeQueueRow('),src.indexOf('function drawQueue('));
  assert.match(body,/if\(target\.dataset\.sourceLane!==nextLane\)/);
  assert.match(body,/target\.value=nextLane===/);
  assert.match(body,/onClick:\(\)=>moveTo\(target\.value\)/);
  assert.match(body,/view\.index=index/);
  assert.match(body,/to:view\.index-1/);
  assert.match(body,/to:view\.index\+1/);
});

test('Dashboard loads cache-busted v1.7.19 JavaScript',()=>{
  const html=readFileSync(path.join(root,'public/control.html'),'utf8');
  assert.match(html,/control\.js\?v=1\.7\.19/);
  assert.match(html,/style\.css\?v=1\.5\.1/);
});

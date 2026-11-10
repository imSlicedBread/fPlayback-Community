import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(path.join(root,p),'utf8');

test('Dashboard offers all rotation lanes and importer destinations with action bindings',()=>{
  const html=read('public/control.html'),script=read('public/assets/control.js');
  for(const lane of ['playNext','current','recycled','nextRotation']){
    assert.ok(html.includes(`data-queue-lane="${lane}"`),lane);
    assert.ok(script.includes(`${lane}:`),`missing queue JS lane ${lane}`);
  }
  for(const id of ['queueMoveSelected','queueSelectAll','queueMoveTarget','queueSort','queueApplySort',
    'playlistDestination','playlistOrder','addDestination','recycledSort','recycledApplySort']){
    assert.ok(html.includes(`id="${id}"`),id);
    assert.ok(script.includes(`$('${id}')`),`missing JS ${id}`);
  }
  assert.match(script,/action:'moveMany'/);
  assert.match(script,/moveInBatches\(ids,destination/);
  assert.match(script,/action\('sortUpcoming'/);
  assert.match(script,/action\('sortRecycled'/);
  assert.match(script,/action\('move'/);
  assert.match(script,/destination:\$\('playlistDestination'\)\.value/);
  assert.match(script,/order:\$\('playlistOrder'\)\.value/);
  assert.match(html,/style\.css\?v=1\.5\.1/);
  assert.match(html,/control\.js\?v=1\.7\.19/);
});

test('Bundled executable is used from local tools before relying on PATH',()=>{
  const src=read('lib/playlist-import.js');
  assert.match(src,/path\.join\(root,'tools',process\.platform==='win32'\?'yt-dlp\.exe':'yt-dlp'\)/);
  assert.match(src,/fs\.existsSync\(local\)\?local/);
  assert.match(src,/--flat-playlist/);
  assert.match(src,/--skip-download/);
});

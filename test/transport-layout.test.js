import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=readFileSync(path.join(root,'public/control.html'),'utf8');
const css=readFileSync(path.join(root,'public/assets/style.css'),'utf8');

test('Playback actions are centered across the whole Now Playing panel between seek and volume',()=>{
  const start=html.indexOf('<div class="seek-panel"');
  const buttons=html.indexOf('<div class="transport-buttons"');
  const direct=html.indexOf('<div class="seek-direct"');
  const volume=html.indexOf('<div class="volume-panel"');
  assert.ok(start>=0 && start<buttons && buttons<direct && direct<volume);
  assert.match(html,/<div class="transport-buttons"[^>]*>[\s\S]*?id="back"[\s\S]*?id="pause"[\s\S]*?id="replay"[\s\S]*?id="skip"/);
  assert.match(css,/\.transport-panel\{[^}]*width:100%/);
  assert.match(css,/\.transport-buttons\{[^}]*width:100%;justify-content:center/);
  assert.match(css,/\.seek-direct\{[^}]*width:100%/);
});
test('Dashboard uses versioned CSS and JavaScript to bypass old cached layout',()=>{
  assert.match(html,/\/assets\/style\.css\?v=1\.5\.1/);
  assert.match(html,/\/assets\/control\.js\?v=1\.7\.19/);
});

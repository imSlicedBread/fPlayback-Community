import assert from 'node:assert/strict';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'node:test';

const project = fileURLToPath(new URL('..', import.meta.url));
const originalVersion = '2.8.9';
const nextVersion = '2.9.0';
const asset = `Playback-v${nextVersion}.zip`;

function python(args, cwd) {
  const command = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(command, args, {cwd, encoding: 'utf8', windowsHide: true, timeout: 30_000});
  assert.equal(result.status, 0, result.error?.message || result.stderr);
}

function packageStations(root) {
  const source = path.join(root, 'release source');
  fs.mkdirSync(source);
  for (const name of ['package.json', 'server.js', 'lib', 'ops', 'public', 'README.md', 'LICENSE', 'SECURITY.md',
    'TRADEMARKS.md', 'CHANGELOG.md', 'start-player.bat', 'start-player.sh', 'UPDATE-PLAYBACK.bat',
    'INSTALL-AUTO-START.bat', 'UNINSTALL-AUTO-START.bat', 'CHECK-AUTO-START.bat',
    'obs-plugin/LICENSE', 'obs-plugin/README.md', 'obs-plugin/watch-controller.js']) {
    fs.cpSync(path.join(project, name), path.join(source, name), {recursive: true});
  }
  const pkg = path.join(source, 'package.json');
  const metadata = JSON.parse(fs.readFileSync(pkg));
  for (const version of [originalVersion, nextVersion]) {
    fs.writeFileSync(pkg, JSON.stringify({...metadata, version}));
    python(['ops/package-release.py'], source);
  }
  python(['-m', 'zipfile', '-e', path.join(source, 'dist', `Playback-v${originalVersion}.zip`), root], root);
  return path.join(source, 'dist');
}

// A real release ZIP is served to all station processes. Only the station's
// loopback health requests pass through to the network.
function mockReleaseFeed(root, distribution) {
  const preload = path.join(root, 'release-feed.mjs');
  const zip = path.join(distribution, asset);
  const checksum = fs.readFileSync(zip + '.sha256', 'utf8');
  const base = `https://github.com/imSlicedBread/fPlayback-Community/releases/download/v${nextVersion}/`;
  const metadata = {
    draft: false, prerelease: false, tag_name: 'v' + nextVersion,
    assets: [asset, asset + '.sha256'].map(name => ({
      name, state: 'uploaded', size: fs.statSync(path.join(distribution, name)).size,
      browser_download_url: base + name, ...(name === asset ? {digest: 'sha256:' + checksum.split(' ')[0]} : {}),
    })),
  };
  fs.writeFileSync(preload, `
    import fs from 'node:fs';
    const processes = ${JSON.stringify(path.join(root, 'processes'))};
    fs.appendFileSync(processes, 'start ' + process.pid + '\\n');
    process.on('exit', () => fs.appendFileSync(processes, 'exit ' + process.pid + '\\n'));
    const fetchLocal = globalThis.fetch;
    globalThis.fetch = async (input, options) => {
      const url = new URL(input);
      if (url.protocol === 'http:' && url.hostname === '127.0.0.1') return fetchLocal(input, options);
      if (url.href === 'https://api.github.com/repos/imSlicedBread/fPlayback-Community/releases/latest') {
        return Response.json(${JSON.stringify(metadata)});
      }
      if (url.href === ${JSON.stringify(base + asset + '.sha256')}) return new Response(${JSON.stringify(checksum)});
      if (url.href === ${JSON.stringify(base + asset)}) return new Response(fs.readFileSync(${JSON.stringify(zip)}));
      throw new Error('Unexpected external request in update test: ' + url.origin);
    };
  `);
  return preload;
}

async function until(poll, description, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  do {
    const result = await poll();
    if (result) return result;
    await delay(100);
  } while (Date.now() < deadline);
  assert.fail(description());
}

test('a packaged station installs an official-format release, restarts on its port, and preserves its queue and session', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playback-self-update-'));
  const installed = path.join(root, 'Playback');
  const data = path.join(root, 'custom station data');
  const temp = path.join(root, 'temp');
  fs.mkdirSync(temp);
  let station;
  t.after(() => {
    // The preloaded fixture logs every station/helper it owns, including a
    // replacement that may still be alive if an assertion failed.
    const log = path.join(root, 'processes');
    const running = new Set();
    if (fs.existsSync(log)) {
      for (const line of fs.readFileSync(log, 'utf8').trim().split('\n')) {
        const [action, pid] = line.split(' ');
        if (action === 'start') running.add(Number(pid));
        if (action === 'exit') running.delete(Number(pid));
      }
    }
    for (const pid of running) {
      try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    if (station && station.exitCode === null && station.signalCode === null) station.kill('SIGKILL');
    fs.rmSync(root, {recursive: true, force: true, maxRetries: 8, retryDelay: 150});
  });
  const distribution = packageStations(root);
  const preload = mockReleaseFeed(root, distribution);
  const launcher = path.join(installed, 'start-player.bat');
  fs.appendFileSync(launcher, '\r\nrem site-specific launcher settings\r\n');
  const customLauncher = fs.readFileSync(launcher, 'utf8');
  station = spawn(process.execPath, ['server.js'], {
    cwd: installed, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, NODE_OPTIONS: '--import=' + pathToFileURL(preload).href,
      TMP: temp, TEMP: temp, TMPDIR: temp, DATA_DIR: data, PORT: '0', HOST: '127.0.0.1', PB_OPEN_BROWSER: '0',
      ADMIN_TOKEN: 'fixture-token'},
  });
  const exited = once(station, 'exit');
  let output = '';
  for (const stream of [station.stdout, station.stderr]) stream.on('data', chunk => { output += chunk; });
  const base = await until(() => {
    assert.equal(station.exitCode, null, output);
    return /Dashboard: (http:\/\/127\.0\.0\.1:\d+)\/control/.exec(output)?.[1];
  }, () => 'Station failed to start: ' + output, 15_000);
  const post = (route, body, cookie = '') => fetch(base + '/api/' + route, {
    method: 'POST', headers: {'Content-Type': 'application/json', Cookie: cookie},
    body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  });
  assert.equal((await fetch(base + '/api/update')).status, 401);
  assert.equal((await post('update/check', {})).status, 401);
  assert.equal((await post('update/install', {version: nextVersion})).status, 401);
  assert.equal((await post('update/preferences', {autoInstall: true})).status, 401);
  const login = await post('login', {token: 'fixture-token'});
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const get = route => fetch(base + '/api/' + route, {headers: {Cookie: cookie}, signal: AbortSignal.timeout(4000)});
  const releases = await (await get('update')).json();
  assert.equal(releases.status, 'available', JSON.stringify(releases));
  assert.equal(releases.installMode, 'dashboard');
  assert.equal(releases.autoInstall, false);
  assert.equal(releases.installedVersion, originalVersion);
  assert.equal(releases.latestVersion, nextVersion);
  assert.equal((await post('update/install', {version: '2.9.1'}, cookie)).status, 409);
  const add = id => post('control', {action: 'add', url: id, title: 'Station fixture'}, cookie);
  assert.equal((await add('dQw4w9WgXcQ')).status, 200);
  assert.equal((await add('jNQXAC9IVRw')).status, 200);
  const before = await (await get('operator')).json();
  fs.writeFileSync(path.join(data, 'station-note.txt'), 'local settings');
  assert.equal((await post('update/install', {version: nextVersion}, cookie)).status, 202);
  await until(async () => {
    const response = await get('health').catch(() => null);
    if (!response?.ok) return false;
    const health = await response.json();
    if (health.version === nextVersion) return health.ok;
    const state = await get('update').then(res => res.json()).catch(() => null);
    assert.notEqual(state?.status, 'error', state?.message + '\n' + output);
    return false;
  }, () => 'Updated station did not return on its bound port: ' + output);
  assert.equal((await (await get('update')).json()).status, 'current');
  const response = await get('operator');
  assert.equal(response.status, 200);
  const after = await response.json();
  assert.equal(after.current.id, before.current.id);
  assert.equal(after.queue.length, 1);
  assert.equal(after.queue[0].id, before.queue[0].id);
  assert.equal(fs.readFileSync(path.join(data, 'station-note.txt'), 'utf8'), 'local settings');
  assert.equal(fs.readFileSync(launcher, 'utf8'), customLauncher);
  const preferences = await post('update/preferences', {autoInstall: true}, cookie);
  assert.equal(preferences.status, 200);
  assert.equal((await preferences.json()).autoInstall, true);
  assert.equal((await (await get('update')).json()).autoInstall, true);
  assert.equal((await post('shutdown', {confirm: true}, cookie)).status, 202);
  await until(() => station.exitCode !== null, () => 'Launcher still running after shutdown: ' + output, 12_000);
  assert.deepEqual(await exited, [0, null]);
  assert.equal(fs.existsSync(path.join(data, '.instance.lock')), false);
});

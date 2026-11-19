import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {applyStationRelease, stageStationArchive} from '../lib/station-install.js';

const version = '2.3.0';
const manifestName = 'UPDATE-MANIFEST.json';
const pkg = version => JSON.stringify({name: 'fkeylabs-playback', version});
const files = {
  'package.json': pkg(version),
  'public/addition.html': 'new page',
  'server.js': 'new server',
  'lib/http.js': 'new http',
  'ops/boot-service.mjs': 'new service',
  'public/control.html': 'new control',
  'start-player.bat': 'new launcher',
};
const manifest = {
  version, files: Object.entries(files).map(([path, data]) => ({
    path, sha256: createHash('sha256').update(data).digest('hex'),
  })),
};
async function write(root, name, data) {
  const dest = path.join(root, name);
  await fs.mkdir(path.dirname(dest), {recursive: true});
  await fs.writeFile(dest, data);
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playback-install-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const source = path.join(root, 'Playback');
  const installed = path.join(root, 'Installed Playback');
  for (const [file, data] of Object.entries(files)) await write(source, file, data);
  await write(source, manifestName, JSON.stringify(manifest));
  await write(installed, 'package.json', pkg('2.2.9'));
  await write(installed, manifestName, 'old manifest');
  await write(installed, 'server.js', 'old server');
  await write(installed, 'start-player.bat', 'custom launcher');
  await write(installed, 'data/playback.sqlite3', 'station data');
  await write(installed, '.env', 'local config');
  return {root, source, installed};
}

test('stage the packaged ZIP, apply it, and keep station data, launcher and environment', async t => {
  const {root, source, installed} = await fixture(t);
  // Make the same archive layout as the release packager, including an
  // unexpected ZIP member. Only manifest-listed members should be materialized.
  const archive = path.join(root, 'station.zip');
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const archiveResult = spawnSync(python, ['-c', [
    'import pathlib, zipfile, sys',
    'root = pathlib.Path(sys.argv[1])',
    'with zipfile.ZipFile(sys.argv[2], "w", zipfile.ZIP_DEFLATED) as archive:',
    '    for file in root.rglob("*"):',
    '        if file.is_file(): archive.write(file, "Playback/" + file.relative_to(root).as_posix())',
    '    archive.writestr("Playback/../outside.txt", "unlisted")',
  ].join('\n'), source, archive], {encoding: 'utf8'});
  if (archiveResult.error?.code === 'ENOENT') return t.skip('Requires the release packager’s Python runtime');
  assert.equal(archiveResult.status, 0, archiveResult.stderr);
  const stage = path.join(root, 'Staged Release');
  const staged = await stageStationArchive(archive, stage, version);
  await assert.rejects(fs.access(path.join(stage, 'outside.txt')), {code: 'ENOENT'});
  await applyStationRelease(staged, installed, version);
  for (const [name, data] of Object.entries({...files, [manifestName]: JSON.stringify(manifest),
    'start-player.bat': 'custom launcher', '.env': 'local config', 'data/playback.sqlite3': 'station data'})) {
    assert.equal(await fs.readFile(path.join(installed, name), 'utf8'), data);
  }
  await assert.rejects(applyStationRelease(staged, installed, version), /already has/);
});

test('refuse damaged staged files, checkout installs, and files overlapping custom data', async t => {
  const {source, installed} = await fixture(t);
  await assert.rejects(applyStationRelease(source, installed, version, {dataDir: path.join(installed, 'lib')}), /overlaps/);
  await fs.mkdir(path.join(installed, '.git'));
  await assert.rejects(applyStationRelease(source, installed, version), /extracted installation/);
  await fs.rmdir(path.join(installed, '.git'));
  await write(source, 'server.js', 'bad file');
  await assert.rejects(applyStationRelease(source, installed, version), /Checksum mismatch/);
  assert.equal(await fs.readFile(path.join(installed, 'server.js'), 'utf8'), 'old server');
  assert.equal(await fs.readFile(path.join(installed, 'package.json'), 'utf8'), pkg('2.2.9'));
});

test('reject protected manifest paths', async t => {
  const {source, installed} = await fixture(t);
  for (const name of ['../outside', 'C:/escape', '.env.local', 'lib/../data', 'lib/aux.js', 'data/token',
    '.playback-install.sqlite3', '.playback-install.sqlite3-wal']) {
    const invalid = {version, files: [...manifest.files, {path: name, sha256: '1'.repeat(64)}]};
    await write(source, manifestName, JSON.stringify(invalid));
    await assert.rejects(applyStationRelease(source, installed, version), /Invalid file path/);
  }
});

test('protect a future data directory reached through an existing path alias', async t => {
  const {root, source, installed} = await fixture(t);
  const alias = path.join(root, 'station alias');
  try { await fs.symlink(installed, alias, 'junction'); }
  catch (error) {
    if (error.code === 'EPERM') return t.skip('Directory links are disabled on this filesystem');
    throw error;
  }
  await assert.rejects(applyStationRelease(source, installed, version, {dataDir: path.join(alias, 'lib')}), /overlaps/);
  assert.equal(await fs.readFile(path.join(installed, 'package.json'), 'utf8'), pkg('2.2.9'));
  await assert.rejects(fs.access(path.join(installed, 'lib')), {code: 'ENOENT'});
});

test('reject links in the destination or source', async t => {
  const {root, source, installed} = await fixture(t);
  const outside = path.join(root, 'outside');
  await fs.mkdir(outside);
  try { await fs.symlink(outside, path.join(installed, 'public'), 'junction'); }
  catch (error) {
    if (error.code === 'EPERM') return t.skip('Directory links are disabled on this filesystem');
    throw error;
  }
  await assert.rejects(applyStationRelease(source, installed, version), /Unsafe update path/);
  await fs.unlink(path.join(installed, 'public'));
  await fs.rename(path.join(source, 'public'), path.join(root, 'original-public'));
  await fs.symlink(path.join(root, 'original-public'), path.join(source, 'public'), 'junction');
  await assert.rejects(applyStationRelease(source, installed, version), /Unsafe update path/);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('roll back earlier replacements and additions if a file cannot be installed', async t => {
  const {source, installed} = await fixture(t);
  const rename = fs.rename.bind(fs);
  t.mock.method(fs, 'rename', (from, to) => {
    if (from.endsWith(path.join('new', 'server.js'))) throw new Error('Simulated install failure');
    return rename(from, to);
  });
  await assert.rejects(applyStationRelease(source, installed, version), /Simulated install failure/);
  assert.equal(await fs.readFile(path.join(installed, 'package.json'), 'utf8'), pkg('2.2.9'));
  assert.equal(await fs.readFile(path.join(installed, 'server.js'), 'utf8'), 'old server');
  assert.equal(await fs.readFile(path.join(installed, manifestName), 'utf8'), 'old manifest');
  await assert.rejects(fs.access(path.join(installed, 'public')), {code: 'ENOENT'});
  await assert.rejects(fs.access(path.join(installed, '.playback-update-transaction')), {code: 'ENOENT'});
});

test('retain backups and prevent restart after an incomplete rollback', async t => {
  const {source, installed} = await fixture(t);
  const rename = fs.rename.bind(fs);
  t.mock.method(fs, 'rename', (from, to) => {
    if (from.endsWith(path.join('new', 'server.js')) || from.endsWith(path.join('old', 'server.js'))) {
      throw new Error('Simulated locked destination');
    }
    return rename(from, to);
  });
  await assert.rejects(applyStationRelease(source, installed, version), {recoveryRequired: true});
  assert.equal(await fs.readFile(path.join(installed, '.playback-update-transaction/old/server.js'), 'utf8'), 'old server');
  await assert.rejects(applyStationRelease(source, installed, version), {recoveryRequired: true});
});

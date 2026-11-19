import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compareStationVersions, downloadStationRelease, getLatestStationRelease } from '../lib/station-release.js';

const version = '1.10.0';
const name = 'Playback-v1.10.0.zip';
const base = 'https://github.com/imSlicedBread/fPlayback-Community/releases/download/v1.10.0/';
const latest = 'https://api.github.com/repos/imSlicedBread/fPlayback-Community/releases/latest';
const bytes = Buffer.from('release contents');
const sha = createHash('sha256').update(bytes).digest('hex');
const checksum = `${sha}  ${name}\r\n`;
const cdn = 'https://release-assets.githubusercontent.com/github-production-release-asset/file?sig=abc';

function releaseFixture() {
  return {
    draft: false, prerelease: false, tag_name: 'v' + version,
    assets: [
      { name, size: bytes.length, digest: 'sha256:' + sha, state: 'uploaded', browser_download_url: base + name },
      { name: name + '.sha256', size: checksum.length, state: 'uploaded', browser_download_url: base + name + '.sha256' }
    ]
  };
}

async function tempArchive(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'playback-release-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, name);
}

const release = { version, name, size: bytes.length, digest: 'sha256:' + sha };
const metadataFetch = fixture => async () => Response.json(fixture);

test('stable version comparison orders version components numerically', () => {
  assert.equal(compareStationVersions('1.10.0', '1.9.99'), 1);
  assert.equal(compareStationVersions('1.7.20', '2.0.0'), -1);
  assert.equal(compareStationVersions('1.7.20', '1.7.20'), 0);
  for (const value of ['1.0.0-beta', '1.0', 'v1.0.0', '1.01.0', '1.0.0/../next', '99999999999999999.0.1']) {
    assert.throws(() => compareStationVersions(value, version));
  }
});

test('release selection accepts only published versioned station assets on the official repository', async () => {
  assert.deepEqual(await getLatestStationRelease({ fetchImpl: async (url, options) => {
    assert.equal(url, latest);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(releaseFixture());
  } }), release);
  for (const change of [
    f => { f.prerelease = true; },
    f => { f.draft = true; },
    f => { f.tag_name = 'v1.10.0-beta'; },
    f => { f.assets.pop(); },
    f => { f.assets.push(f.assets[0]); },
    f => { f.assets[0].state = 'open'; },
    f => { f.assets[0].browser_download_url = base.replace('imSlicedBread', 'someone') + name; },
    f => { f.assets[0].size = 2 ** 32; },
    f => { f.assets[0].digest = 'invalid'; },
  ]) {
    const fixture = releaseFixture();
    change(fixture);
    await assert.rejects(getLatestStationRelease({ fetchImpl: metadataFetch(fixture) }));
  }
});

test('downloads via the official asset CDN and verifies the named sidecar, digest and length', async t => {
  const destination = await tempArchive(t);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    if (url === base + name + '.sha256') return new Response(checksum);
    if (url === base + name) return Response.redirect(cdn);
    if (url === cdn) return new Response(bytes);
    assert.fail('Unexpected URL: ' + url);
  };
  await downloadStationRelease(release, destination, { fetchImpl });
  assert.deepEqual(calls, [base + name + '.sha256', base + name, cdn]);
  assert.deepEqual(await readFile(destination), bytes);
});

test('a missing API digest can use the published checksum and existing files stay intact', async t => {
  const destination = await tempArchive(t);
  const fixture = releaseFixture();
  delete fixture.assets[0].digest;
  const info = await getLatestStationRelease({ fetchImpl: metadataFetch(fixture) });
  const fetchImpl = async url => new Response(url.endsWith('.sha256') ? checksum : bytes);
  await downloadStationRelease(info, destination, { fetchImpl });
  await writeFile(destination, 'existing file');
  await assert.rejects(downloadStationRelease(info, destination, { fetchImpl }), { code: 'EEXIST' });
  assert.equal(await readFile(destination, 'utf8'), 'existing file');
});

test('failed downloads and integrity checks leave no ZIP for the installer', async t => {
  const destination = await tempArchive(t);
  for (const [sidecar, archive] of [
    [() => new Response(checksum.replace(name, 'something.zip')), () => assert.fail('unexpected download')],
    [() => new Response(checksum.replace(sha, 'a'.repeat(64))), () => assert.fail('unexpected download')],
    [() => new Response('x'.repeat(2048)), () => assert.fail('unexpected download')],
    [() => new Response(checksum), () => new Response(Buffer.alloc(bytes.length))],
    [() => new Response(checksum), () => new Response(bytes.subarray(1))],
    [() => new Response(checksum), () => new Response(Buffer.alloc(bytes.length + 1))],
    [() => new Response(checksum), () => new Response(bytes, { headers: { 'content-length': '99999' } })],
    [() => new Response(checksum), () => Response.redirect('https://example.com/release')],
    [() => new Response(checksum), () => new Response(null, { status: 404 })],
    [() => new Response(checksum), () => { throw new Error('Connection interrupted'); }]
  ]) {
    await assert.rejects(downloadStationRelease(release, destination, { fetchImpl: async url => {
      if (url === base + name + '.sha256') return sidecar();
      assert.equal(url, base + name);
      return archive();
    } }));
    await assert.rejects(stat(destination), { code: 'ENOENT' });
  }
});

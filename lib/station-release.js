import { createHash } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';

const repository = 'imSlicedBread/fPlayback-Community';
const latestRelease = `https://api.github.com/repos/${repository}/releases/latest`;
const maxArchiveBytes = 128 * 1024 * 1024;
const checksumLimit = 1024;
const assetHosts = new Set(['release-assets.githubusercontent.com', 'objects.githubusercontent.com']);

function versionParts(version) {
  if (typeof version !== 'string' || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version)) {
    throw new Error('Expected a stable Playback version.');
  }
  const parts = version.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Invalid Playback version.');
  return parts;
}

export function compareStationVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  }
  return 0;
}

function assetURL(version, name) {
  return `https://github.com/${repository}/releases/download/v${version}/${name}`;
}

// GitHub serves release binaries from its signed asset CDN. Do not follow a
// Location header to an arbitrary host, even for the checksum sidecar.
async function request(url, fetchImpl, signal, asset = false) {
  const headers = { 'User-Agent': 'fKey-Playback-Updater', Accept: asset ? 'application/octet-stream' : 'application/vnd.github+json' };
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetchImpl(url, { signal, headers, redirect: 'manual' });
    if (response.status === 200 && response.body) return response;
    await response.body?.cancel();
    if (!asset || ![301, 302, 303, 307, 308].includes(response.status)) {
      throw new Error(`GitHub release request failed (HTTP ${response.status}).`);
    }
    const location = response.headers.get('location');
    if (!location) throw new Error('GitHub returned an empty release redirect.');
    const next = new URL(location, url);
    if (next.protocol !== 'https:' || next.port || next.username || next.password || !assetHosts.has(next.hostname)) {
      throw new Error('Unexpected GitHub release download host.');
    }
    url = next.href;
  }
  throw new Error('Too many redirects downloading the GitHub release.');
}

async function* limitedBody(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body.cancel();
    throw new Error('GitHub release response exceeds its size limit.');
  }
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > limit) throw new Error('GitHub release response exceeds its size limit.');
    yield chunk;
  }
}

async function readText(response, limit) {
  const chunks = [];
  for await (const chunk of limitedBody(response, limit)) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function validSize(size, limit) {
  return Number.isSafeInteger(size) && size > 0 && size <= limit;
}

function checkDigest(digest) {
  if (digest != null && (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(digest))) {
    throw new Error('Invalid SHA-256 digest for the release archive.');
  }
}

export async function getLatestStationRelease({ fetchImpl = fetch } = {}) {
  const response = await request(latestRelease, fetchImpl, AbortSignal.timeout(15000));
  const release = JSON.parse(await readText(response, 1024 * 1024));
  if (release?.draft !== false || release.prerelease !== false || !release.tag_name?.startsWith('v')) {
    throw new Error('GitHub did not return a published stable Playback release.');
  }
  const version = release.tag_name.slice(1);
  versionParts(version);
  const name = `Playback-v${version}.zip`;
  function asset(assetName, limit) {
    const matches = Array.isArray(release.assets) ? release.assets.filter(item => item?.name === assetName) : [];
    if (matches.length !== 1 || matches[0].state !== 'uploaded' ||
      matches[0].browser_download_url !== assetURL(version, assetName) || !validSize(matches[0].size, limit)) {
      throw new Error(`Missing or invalid official release asset: ${assetName}.`);
    }
    return matches[0];
  }
  const archive = asset(name, maxArchiveBytes);
  asset(name + '.sha256', checksumLimit);
  checkDigest(archive.digest);
  return { version, name, size: archive.size, digest: archive.digest ?? null };
}

export async function downloadStationRelease(release, destination, { fetchImpl = fetch } = {}) {
  const { version, name, size, digest } = release;
  versionParts(version);
  if (name !== `Playback-v${version}.zip` || !validSize(size, maxArchiveBytes)) {
    throw new Error('Invalid Playback release archive.');
  }
  checkDigest(digest);
  const url = assetURL(version, name);
  const sidecar = await request(url + '.sha256', fetchImpl, AbortSignal.timeout(15000), true);
  const checksum = (await readText(sidecar, checksumLimit)).trim().match(/^([a-f0-9]{64})[ \t]+\*?(\S+)$/i);
  if (!checksum || checksum[2] !== name) throw new Error('Invalid Playback release checksum file.');
  const expectedHash = checksum[1].toLowerCase();
  if (digest && digest.toLowerCase() !== 'sha256:' + expectedHash) {
    throw new Error('The GitHub asset digest and release checksum disagree.');
  }

  const file = await open(destination, 'wx', 0o600);
  try {
    try {
      const response = await request(url, fetchImpl, AbortSignal.timeout(180000), true);
      const hash = createHash('sha256');
      let received = 0;
      async function* verifiedBody() {
        for await (const chunk of limitedBody(response, size)) {
          received += chunk.byteLength;
          hash.update(chunk);
          yield chunk;
        }
      }
      await file.writeFile(verifiedBody());
      if (received !== size || hash.digest('hex') !== expectedHash) {
        throw new Error('The downloaded ZIP failed release verification.');
      }
    } finally {
      await file.close();
    }
  } catch (error) {
    await unlink(destination);
    throw error;
  }
}

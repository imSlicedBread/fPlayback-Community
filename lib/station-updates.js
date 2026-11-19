import fs from 'node:fs/promises';
import {readFileSync, writeFileSync, renameSync, rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {compareStationVersions, getLatestStationRelease, downloadStationRelease} from './station-release.js';
import {applyStationRelease, stageStationArchive} from './station-install.js';

const day = 24 * 60 * 60 * 1000;
export async function stageLatestRelease(release, directory) {
  const archive = path.join(directory, release.name);
  await downloadStationRelease(release, archive);
  try { return await stageStationArchive(archive, directory, release.version); }
  finally { await fs.unlink(archive); }
}

export function stationUpdates({
  root, dataDir, installedVersion, mode, guidance = '', previousError = '',
  getLatest = getLatestStationRelease, stage = stageLatestRelease, apply = applyStationRelease,
  beforeStop, stop, restart, clock = Date.now,
}) {
  let latest, checking, installing = false, closed = false;
  const preferences = path.join(dataDir, 'station-updates.json');
  let autoInstall = false, attemptedVersion;
  if (mode === 'dashboard') {
    try {
      const saved = JSON.parse(readFileSync(preferences, 'utf8'));
      autoInstall = saved?.autoInstall === true;
      attemptedVersion = saved?.attemptedVersion;
    }
    catch (cause) { if (cause.code !== 'ENOENT') console.warn('Could not read Playback update preferences:', cause.message); }
  }
  function savePreferences(enabled, attempted) {
    const temporary = preferences + '.' + randomUUID() + '.tmp';
    try {
      writeFileSync(temporary, JSON.stringify({autoInstall: enabled, attemptedVersion: attempted}) + '\n', {flag: 'wx', mode: 0o600, flush: true});
      renameSync(temporary, preferences);
    } finally { rmSync(temporary, {force: true}); }
  }
  let error = previousError, checkedAt = previousError ? clock() : -Infinity;
  function state() {
    const available = latest && compareStationVersions(latest.version, installedVersion) > 0;
    const status = installing ? 'installing' : error ? 'error' : !latest ? 'unchecked' : available ? 'available' : 'current';
    return {installedVersion, latestVersion: latest?.version ?? null, installMode: mode, status, autoInstall,
      message: installing ? 'Downloading and verifying the update before restarting Playback.' : error || (available ? guidance : '')};
  }
  function check(force = false) {
    if (checking) return checking;
    const ttl = error ? 5 * 60 * 1000 : day;
    if (closed || installing || (!force && clock() - checkedAt < ttl)) return state();
    checking = Promise.resolve().then(async () => {
      try { latest = await getLatest(); error = ''; }
      catch (cause) { latest = null; error = 'Could not check for Playback updates. ' + cause.message; }
      finally { checkedAt = clock(); checking = null; }
      startAutomaticUpdate();
      return state();
    });
    return checking;
  }
  async function perform(release) {
    let directory, stopped = false;
    try {
      directory = await fs.mkdtemp(path.join(os.tmpdir(), 'playback-release-'));
      const source = await stage(release, directory);
      if (closed) return;
      // A failed install may restart the old release. Prevent unattended
      // restarts from attempting that same release again without an operator.
      if (autoInstall) savePreferences(true, release.version);
      beforeStop();
      await stop();
      stopped = true;
      await apply(source, root, release.version, {dataDir});
      error = '';
    } catch (cause) {
      error = 'Playback update failed. ' + cause.message;
      console.error(error);
      if (cause.recoveryRequired && stopped) { stopped = false; process.exitCode = 1; }
    } finally {
      if (directory) await fs.rm(directory, {recursive: true, force: true}).catch(cause => console.warn('Could not remove update staging folder:', cause.message));
      installing = false;
      if (stopped) restart(error);
    }
  }
  function install(version) {
    if (mode !== 'dashboard') throw Object.assign(new Error(guidance), {status: 409});
    if (closed || installing || checking || state().status !== 'available' || latest.version !== version) {
      throw Object.assign(new Error('Check for an available release and confirm its version before updating.'), {status: 409});
    }
    attemptedVersion = version;
    installing = true;
    void perform(latest);
    return state();
  }
  function startAutomaticUpdate() {
    if (autoInstall && !closed && !checking && state().status === 'available' && attemptedVersion !== latest.version) {
      install(latest.version);
    }
  }
  function setAutoInstall(enabled) {
    if (typeof enabled !== 'boolean') throw Object.assign(new Error('Choose whether to enable automatic installation.'), {status: 400});
    if (mode !== 'dashboard' || installing || closed) throw Object.assign(new Error(guidance || 'An update is in progress.'), {status: 409});
    savePreferences(enabled, attemptedVersion);
    autoInstall = enabled;
    startAutomaticUpdate();
    return state();
  }
  // A packaged, running station checks every day. The first check stays off the startup path.
  const first = mode !== 'manual' && setTimeout(() => { void check(); }, 60_000).unref();
  const daily = mode !== 'manual' && setInterval(() => { void check(true); }, day).unref();
  return {check, install, setAutoInstall, close() { closed = true; clearTimeout(first); clearInterval(daily); }};
}

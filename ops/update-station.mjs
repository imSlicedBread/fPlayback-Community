import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareStationVersions, getLatestStationRelease} from '../lib/station-release.js';
import {stageLatestRelease} from '../lib/station-updates.js';
import {applyStationRelease} from '../lib/station-install.js';
import {isPackagedStation, openInstallLock} from '../lib/station-install-lock.js';
import {processLock} from '../lib/store.js';
import {VERSION} from '../lib/version.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
let temporary, lock, releaseData;
async function update() {
  // The Windows updater already stopped the registered boot task. Keep the
  // same installation lock as the dashboard until PowerShell finishes copying.
  if (args.length === 2 && args[0] === '--lock-install' && path.isAbsolute(args[1])) {
    const pkg = JSON.parse(await fs.readFile(path.join(args[1], 'package.json'), 'utf8'));
    if (pkg.name !== 'fkeylabs-playback') throw new Error('Expected a Playback Community installation.');
    lock = openInstallLock(args[1]);
    lock.exclusive();
    process.stdout.write('locked\n');
    for await (const _ of process.stdin) { /* hold until the updater closes stdin */ }
    return;
  }
  const stageOnly = args.length === 2 && args[0] === '--stage' && path.isAbsolute(args[1]);
  if (args.length && !stageOnly) throw new Error('Usage: node ops/update-station.mjs [--stage ABSOLUTE_DIRECTORY]');
  if (!isPackagedStation(root)) throw new Error('Run the updater from an installed Playback release ZIP. Use Git for a source checkout.');
  const release = await getLatestStationRelease();
  if (compareStationVersions(release.version, VERSION) <= 0) {
    console.log(`Playback ${VERSION} is up to date.`);
  } else {
    const directory = stageOnly ? args[1] : (temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'playback-release-')));
    if (stageOnly && (await fs.readdir(directory)).length) throw new Error('The staging folder must be empty.');
    console.log(`Downloading and verifying Playback ${release.version}…`);
    const source = await stageLatestRelease(release, directory);
    if (!stageOnly) {
      const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
      lock = openInstallLock(root);
      lock.exclusive();
      releaseData = processLock(dataDir);
      await applyStationRelease(source, root, release.version, {dataDir});
      console.log(`Playback ${release.version} is installed. Start the station as usual.`);
    }
  }
}
try {
  await update();
} catch (error) {
  console.error('Playback updater:', error.message);
  process.exitCode = 1;
} finally {
  releaseData?.();
  lock?.close();
  if (temporary) await fs.rm(temporary, {recursive: true, force: true});
}

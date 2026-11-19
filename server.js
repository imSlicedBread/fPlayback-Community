import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createApp} from './lib/http.js';
import {openDashboard,openExistingDashboard} from './lib/open-dashboard.js';
import {VERSION} from './lib/version.js';
import {isPackagedStation, openInstallLock} from './lib/station-install-lock.js';
import {stationUpdates} from './lib/station-updates.js';
import {restartStation, updateChild} from './lib/station-restart.js';

const PORT=Number(process.env.PORT||4177);
const HOST=process.env.HOST||'127.0.0.1';
const DATA_DIR=process.env.DATA_DIR||path.join(path.dirname(fileURLToPath(import.meta.url)),'data');
if(!Number.isInteger(PORT)||PORT<0||PORT>65535)throw new Error('Invalid PORT');
const root = path.dirname(fileURLToPath(import.meta.url));
let app, installLock, updates, actualPort, replacing = false, shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (replacing) return; // Finish the file transaction before exiting.
  app.close().then(() => process.exit(0), error => {console.error('Shutdown failed:',error.message);process.exit(1);});
  setTimeout(() => process.exit(1),4000).unref();
}
const controlMessage = message => { if (message === 'shutdown') shutdown(); };
try {
  const boot = process.platform === 'win32' && path.basename(process.argv[1] || '') === 'boot-service.mjs';
  let mode = 'manual';
  let guidance = 'Install from a release ZIP to use the station updater. Update a source checkout through Git.';
  if (fs.existsSync(path.join(root, '.playback-update-transaction'))) {
    throw new Error('An interrupted update requires recovery. Inspect .playback-update-transaction in the Playback folder before starting the station.');
  }
  if (isPackagedStation(root)) {
    guidance = 'Stop Playback, then run node ops/update-station.mjs in the installed folder with write access.';
    try {
      installLock = openInstallLock(root);
      fs.accessSync(root, fs.constants.W_OK);
      mode = 'dashboard';
      guidance = '';
    } catch (error) {
      // Read-only installations can still play. A busy lock is an active install.
      if ([5, 6].includes(error.errcode) || error.message === 'Invalid installation lock file.') throw error;
      if (fs.existsSync(path.join(root, '.playback-install.sqlite3')) && !installLock) {
        installLock = openInstallLock(root, {readOnly: true});
      }
    }
    if (boot) {
      mode = 'launcher';
      guidance = 'Run UPDATE-PLAYBACK.bat from your installed Playback folder and approve the Windows prompt.';
    }
  }
  updates = stationUpdates({
    root, dataDir: path.resolve(DATA_DIR), installedVersion: VERSION, mode, guidance,
    previousError: updateChild ? process.env.PB_UPDATE_ERROR : '',
    beforeStop: () => { installLock.exclusive(); replacing = true; },
    stop: () => app.close(),
    restart: error => {
      installLock.close();
      process.off('SIGINT',shutdown); process.off('SIGTERM',shutdown);
      process.off('message',controlMessage); process.off('disconnect',shutdown);
      app = null;
      if (!shuttingDown) restartStation(actualPort, error);
      else if (updateChild && process.connected) process.disconnect();
    },
  });
  app=createApp({host:HOST,port:PORT,dataDir:DATA_DIR,updates});
  const address=await app.listen();
  const p=address.port;
  actualPort=p;
  console.log(`fKey Playback made by fKey Labs Inc. ${VERSION} ready\n  Dashboard: http://127.0.0.1:${p}/control\n  Settings:  http://127.0.0.1:${p}/settings\n  OBS:       http://127.0.0.1:${p}/player\n  Viewer:    http://127.0.0.1:${p}/vote\n  Token:     ${path.join(DATA_DIR,'admin-token.txt')}\n  State:     ${path.join(DATA_DIR,'playback.sqlite3')}`);
  openDashboard({port:p});
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
  if (updateChild) {
    process.on('message',controlMessage);
    process.on('disconnect',shutdown);
    // The parent supervises the console. The IPC channel must not keep an
    // otherwise stopped station alive after /api/shutdown.
    process.channel.unref();
  }
}catch(e){
  app?.cleanup();
  updates?.close();
  installLock?.close();
  if(e.code==='PLAYBACK_INSTANCE_LOCKED'&&await openExistingDashboard({port:PORT})) {
    console.log(`Playback is already running. Dashboard: http://127.0.0.1:${PORT}/control`);
  } else {
    console.error('Failed to start:',e.message);
    process.exitCode=1;
  }
}

import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const entry = fileURLToPath(new URL('../server.js', import.meta.url));
export const updateChild = process.argv[2] === '--updated-station' && typeof process.send === 'function';

// Keep the manual launcher's console, exit status, environment and signals.
// Later updates recycle the same child slot instead of nesting supervisors.
export function restartStation(port, updateError) {
  if (updateChild) {
    process.send({restart: true, updateError}, () => process.disconnect());
    return;
  }
  let child, stopping = false;
  const stop = () => {
    stopping = true;
    if (child?.connected) child.send('shutdown', () => {});
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  function start(previousError) {
    let next = null;
    child = spawn(process.execPath, [...process.execArgv, entry, '--updated-station'], {
      env: {...process.env, PORT: String(port), PB_OPEN_BROWSER: '0', PB_UPDATE_ERROR: previousError},
      windowsHide: true, stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });
    child.on('message', message => {
      if (message?.restart === true) next = String(message.updateError || '');
    });
    child.once('error', error => { console.error('Could not restart Playback:', error.message); });
    child.once('close', (code, signal) => {
      if (next !== null && code === 0 && !stopping) { start(next); return; }
      process.off('SIGTERM', stop);
      process.off('SIGINT', stop);
      process.exitCode = code ?? (signal ? 1 : 0);
    });
  }
  start(updateError);
}

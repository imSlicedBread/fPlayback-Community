import {$, api, showNotice} from './common.js?v=1.5.1';

export function setupStationUpdates() {
  const check = $('checkUpdate');
  const install = $('installUpdate');
  const autoInstall = $('autoInstall');
  let savedAutoInstall = false;
  let availableVersion = '';
  let busy = false;

  function setBusy(value) {
    busy = value;
    check.disabled = value;
    install.disabled = value;
    autoInstall.disabled = value;
  }

  function render(state) {
    const versions = [`Installed ${state.installedVersion}`];
    if (state.latestVersion) versions.push(`Latest release ${state.latestVersion}`);
    $('updateVersions').textContent = versions.join(' · ');
    $('autoInstallSetting').classList.toggle('hidden', state.installMode !== 'dashboard');
    savedAutoInstall = state.autoInstall === true;
    autoInstall.checked = savedAutoInstall;
    const available = state.status === 'available';
    availableVersion = available && state.installMode === 'dashboard' ? state.latestVersion : '';
    install.classList.toggle('hidden', !availableVersion);
    let message = state.message;
    if (!message && available && state.installMode === 'launcher') {
      message = 'Run UPDATE-PLAYBACK.bat in your installed Playback folder to update the station.';
    } else if (!message && available && state.installMode === 'manual') {
      message = 'From your installed Playback folder, run node ops/update-station.mjs.';
    }
    const defaults = {
      unchecked: 'Check for the latest station release.',
      current: 'Your station is up to date.',
      available: 'A station update is available.',
      installing: 'Updating Playback. Waiting for the station to restart…',
      error: 'The update check failed. Try checking again.',
    };
    showNotice('updateStatus', message || defaults[state.status], state.status === 'error' ? 'error' : '');
  }

  async function waitForRestart(version) {
    showNotice('updateStatus', `Updating to ${version}. Waiting for the station to restart…`);
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      const health = await api('health', {signal: AbortSignal.timeout(4000)}).catch(() => null);
      if (health?.ok && health.app === 'fKey Playback' && health.version === version) {
        render({installedVersion: version, latestVersion: version, status: 'current', installMode: 'dashboard', autoInstall: savedAutoInstall});
        showNotice('updateStatus', `Playback ${version} is running. Refresh this page to load the updated dashboard.`, 'success');
        return;
      }
      if (health?.ok) {
        const state = await api('update', {signal: AbortSignal.timeout(4000)}).catch(() => null);
        if (state?.status === 'error') { render(state); return; }
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error(`Playback ${version} has not reported a healthy restart yet. Check for updates again to see the station’s status.`);
  }

  async function request(route, options, progress = 'Checking for updates…', requestedVersion) {
    if (busy) return;
    setBusy(true);
    showNotice('updateStatus', progress);
    try {
      const state = await api(route, options);
      render(state);
      if (state.status === 'installing') await waitForRestart(requestedVersion || state.latestVersion);
    } catch (error) {
      autoInstall.checked = savedAutoInstall;
      if (error.status === 401) $('auth').classList.remove('hidden');
      showNotice('updateStatus', error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  check.addEventListener('click', () => request('update/check', {method: 'POST', data: {}}));
  autoInstall.addEventListener('change', () => {
    const enabled = autoInstall.checked;
    if (busy || enabled === savedAutoInstall) { autoInstall.checked = savedAutoInstall; return; }
    if (enabled && !window.confirm('Install any available update now and automatically install future releases? Playback will restart for each update, even during a live broadcast.')) {
      autoInstall.checked = savedAutoInstall;
      return;
    }
    return request('update/preferences', {method: 'POST', data: {autoInstall: enabled}}, 'Saving update preferences…');
  });
  install.addEventListener('click', () => {
    if (!availableVersion || busy) return;
    const version = availableVersion;
    if (window.confirm(`Install Playback ${version} and restart the station? Playback will pause during the restart.`)) {
      return request('update/install', {method: 'POST', data: {version}}, `Preparing Playback ${version}…`, version);
    }
  });
  return () => request('update');
}

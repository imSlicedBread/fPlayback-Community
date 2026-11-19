import assert from 'node:assert/strict';
import test from 'node:test';
import {setupStationUpdates} from '../public/assets/station-update.js';

const available = {installedVersion: '1.8.0', latestVersion: '1.9.0', status: 'available', installMode: 'dashboard'};

function openSettings(t, respond) {
  const elements = {};
  for (const id of ['checkUpdate', 'installUpdate', 'autoInstallSetting', 'autoInstall', 'updateVersions', 'updateStatus', 'auth']) {
    const classes = new Set(['hidden']);
    elements[id] = {
      classList: {
        add: name => classes.add(name),
        remove: name => classes.delete(name),
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
        contains: name => classes.has(name),
      },
      addEventListener(event, handler) { this[event] = handler; },
    };
  }
  globalThis.document = {getElementById: id => elements[id]};
  globalThis.window = {confirm: () => false};
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({url, method: options.method, data: options.body && JSON.parse(options.body)});
    return Response.json(await respond(url, options));
  });
  return {elements, calls, load: setupStationUpdates()};
}

test('install requires confirmation and waits for a healthy station reporting the requested version', async t => {
  let reportHealth;
  const health = Promise.withResolvers();
  const {elements, calls, load} = openSettings(t, url => {
    if (url === '/api/update') return available;
    if (url === '/api/update/install') return {status: 'installing'};
    if (url === '/api/health') { health.resolve(); return new Promise(resolve => { reportHealth = resolve; }); }
    assert.fail(url);
  });
  await load();
  assert.match(elements.updateVersions.textContent, /1\.8\.0.+1\.9\.0/);
  assert.equal(elements.installUpdate.classList.contains('hidden'), false);
  await elements.installUpdate.click();
  assert.equal(calls.length, 1);

  window.confirm = message => { assert.match(message, /1\.9\.0.+restart/); return true; };
  const installing = elements.installUpdate.click();
  await health.promise;
  await elements.installUpdate.click();
  assert.equal(elements.checkUpdate.disabled, true);
  assert.match(elements.updateStatus.textContent, /Waiting/);
  assert.deepEqual(calls[1], {url: '/api/update/install', method: 'POST', data: {version: '1.9.0'}});
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  reportHealth({ok: true, app: 'fKey Playback', version: '1.9.0'});
  await installing;
  assert.equal(elements.updateStatus.className, 'notice success');
  assert.match(elements.updateVersions.textContent, /Installed 1\.9\.0/);
  assert.equal(elements.checkUpdate.disabled, false);
});

test('the previous version responding during rollback is not reported as an installed update', async t => {
  let checks = 0;
  const {elements, load} = openSettings(t, url => {
    if (url === '/api/update') return ++checks === 1 ? available : {...available, status: 'error', message: 'Update rolled back'};
    if (url === '/api/update/install') return {status: 'installing'};
    if (url === '/api/health') return {ok: true, app: 'fKey Playback', version: available.installedVersion};
    assert.fail(url);
  });
  await load();
  window.confirm = () => true;
  await elements.installUpdate.click();
  assert.equal(elements.updateStatus.className, 'notice error');
  assert.equal(elements.updateStatus.textContent, 'Update rolled back');
  assert.equal(elements.checkUpdate.disabled, false);
});

test('update checks can be retried and show the instructions for each installation', async t => {
  let mode = 'launcher', message;
  const {elements, calls, load} = openSettings(t, () => ({...available, installMode: mode, message}));
  await load();
  assert.equal(elements.installUpdate.classList.contains('hidden'), true);
  assert.equal(elements.autoInstallSetting.classList.contains('hidden'), true);
  assert.match(elements.updateStatus.textContent, /UPDATE-PLAYBACK\.bat/);
  mode = 'manual';
  await elements.checkUpdate.click();
  assert.deepEqual(calls[1], {url: '/api/update/check', method: 'POST', data: {}});
  assert.match(elements.updateStatus.textContent, /node ops\/update-station\.mjs/);
  message = 'This is a source checkout. Update it through Git.';
  await elements.checkUpdate.click();
  assert.equal(elements.updateStatus.textContent, message);
  assert.equal(elements.installUpdate.classList.contains('hidden'), true);
});

test('automatic updates require opt-in, persist server state, and restore the saved choice on errors', async t => {
  let enabled = false, shouldFail = false, prompts = 0;
  const {elements, calls, load} = openSettings(t, (url, options) => {
    if (url === '/api/update/preferences') {
      if (shouldFail) throw new Error('Cannot save update preferences');
      enabled = JSON.parse(options.body).autoInstall;
    }
    return {...available, status: 'current', autoInstall: enabled};
  });
  const toggle = elements.autoInstall;
  await load();
  assert.equal(elements.autoInstallSetting.classList.contains('hidden'), false);
  assert.equal(toggle.checked, false);
  toggle.checked = true;
  await toggle.change();
  assert.equal(toggle.checked, false);
  assert.equal(calls.length, 1);
  window.confirm = message => {
    assert.match(message, /now.+future.+restart/);
    prompts++;
    return true;
  };
  toggle.checked = true;
  const saving = toggle.change();
  assert.equal(toggle.disabled, true);
  await saving;
  assert.deepEqual(calls[1], {url: '/api/update/preferences', method: 'POST', data: {autoInstall: true}});
  assert.equal(toggle.checked, true);
  assert.equal(toggle.disabled, false);
  shouldFail = true;
  toggle.checked = false;
  await toggle.change();
  assert.match(elements.updateStatus.textContent, /Cannot save/);
  assert.equal(toggle.checked, true);
  shouldFail = false;
  toggle.checked = false;
  await toggle.change();
  assert.equal(toggle.checked, false);
  assert.equal(prompts, 1);
});

test('enabling automatic updates monitors an immediately accepted installation', async t => {
  const {elements, calls, load} = openSettings(t, url => {
    if (url === '/api/update') return available;
    if (url === '/api/update/preferences') return {...available, status: 'installing', autoInstall: true};
    if (url === '/api/health') return {ok: true, app: 'fKey Playback', version: available.latestVersion};
    assert.fail(url);
  });
  await load();
  window.confirm = () => true;
  elements.autoInstall.checked = true;
  await elements.autoInstall.change();
  assert.deepEqual(calls.map(call => call.url), ['/api/update', '/api/update/preferences', '/api/health']);
  assert.equal(elements.autoInstall.checked, true);
  assert.equal(elements.updateStatus.className, 'notice success');
});

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {setTimeout as wait} from 'node:timers/promises';
import {stationUpdates} from '../lib/station-updates.js';

const installedVersion = '1.10.3';
const latestVersion = '1.11.0';

async function station(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playback-updates-test-'));
  const dataDir = path.join(root, 'custom data');
  await fs.mkdir(dataDir);
  const controllers = [];
  t.after(async () => {
    for (const controller of controllers) controller.close();
    await fs.rm(root, {recursive: true, force: true});
  });
  return function create(overrides = {}) {
    const events = [];
    const restarted = Promise.withResolvers();
    const controller = stationUpdates({
      root, dataDir, installedVersion, mode: 'dashboard',
      getLatest: async () => ({version: latestVersion}),
      stage: async (release, directory) => {
        events.push('stage');
        assert.equal(release.version, latestVersion);
        return path.join(directory, 'Playback');
      },
      beforeStop: () => events.push('lock'),
      stop: () => events.push('stop'),
      apply: async (source, target, version, options) => {
        events.push('apply');
        assert.equal(path.basename(source), 'Playback');
        assert.equal(target, root);
        assert.equal(version, latestVersion);
        assert.equal(options.dataDir, dataDir);
      },
      restart: error => { events.push('restart'); restarted.resolve(error); },
      ...overrides,
    });
    controllers.push(controller);
    return {controller, events, restarted: restarted.promise};
  };
}

async function afterAttempt(controller) {
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    const state = await controller.check();
    if (state.status !== 'installing') return state;
    await wait(15);
  }
  assert.fail('The install attempt did not finish');
}

test('checks share in-flight results, cache discovery and recover from a failed refresh', async t => {
  const create = await station(t);
  let now = 1_000_000, calls = 0, offline = false;
  const discovery = Promise.withResolvers();
  const {controller} = create({
    clock: () => now,
    getLatest: async () => {
      calls++;
      if (offline) throw new Error('Network unavailable');
      return discovery.promise;
    },
  });
  const pending = [controller.check(), controller.check(true)];
  discovery.resolve({version: latestVersion});
  for (const result of await Promise.all(pending)) {
    assert.equal(result.status, 'available');
    assert.equal(result.installedVersion, installedVersion);
    assert.equal(result.latestVersion, latestVersion);
    assert.equal(result.autoInstall, false);
  }
  now += 3_600_000;
  await controller.check();
  assert.equal(calls, 1);
  offline = true;
  const failure = await controller.check(true);
  assert.equal(failure.status, 'error');
  assert.match(failure.message, /Network unavailable/);
  await controller.check();
  assert.equal(calls, 2);
  offline = false;
  assert.equal((await controller.check(true)).status, 'available');
  assert.equal(calls, 3);
});

test('only the advertised newer version can be installed, and installation is single flight', async t => {
  const create = await station(t);
  let version = '1.9.99';
  const {controller, events, restarted} = create({getLatest: async () => ({version})});
  assert.equal((await controller.check()).status, 'current');
  assert.throws(() => controller.install(version), {status: 409});
  version = latestVersion;
  await controller.check(true);
  assert.throws(() => controller.install('1.11.1'), {status: 409});
  assert.equal(controller.install(version).status, 'installing');
  assert.throws(() => controller.install(version), {status: 409});
  assert.equal(await restarted, '');
  assert.deepEqual(events, ['stage', 'lock', 'stop', 'apply', 'restart']);
});

test('automatic installs require a boolean and a dashboard-writable station', async t => {
  const create = await station(t);
  const {controller} = create();
  for (const invalid of ['true', null, 1, {}]) {
    assert.throws(() => controller.setAutoInstall(invalid), {status: 400});
  }
  for (const mode of ['launcher', 'manual']) {
    const other = create({mode, guidance: 'Use the station launcher.'});
    await other.controller.check();
    assert.throws(() => other.controller.setAutoInstall(true), {status: 409});
    assert.throws(() => other.controller.install(latestVersion), {status: 409});
    assert.deepEqual(other.events, []);
  }
});

test('enabling automatic installs applies a known release, persists, and can be turned off', async t => {
  const create = await station(t);
  const first = create();
  assert.equal((await first.controller.check()).status, 'available');
  assert.deepEqual(first.events, []);
  assert.equal(first.controller.setAutoInstall(true).autoInstall, true);
  assert.equal(await first.restarted, '');
  first.controller.close();

  // The restarted version discovers a later release with the same data folder.
  const newer = '1.11.1';
  const second = create({
    installedVersion: latestVersion, getLatest: async () => ({version: newer}),
    stage: async () => 'staged', apply: async (_source, _root, version) => assert.equal(version, newer),
  });
  assert.equal((await second.controller.check()).autoInstall, true);
  assert.equal(await second.restarted, '');
  second.controller.close();
  const third = create();
  assert.equal(third.controller.setAutoInstall(false).autoInstall, false);
  third.controller.close();
  const fourth = create();
  const available = await fourth.controller.check();
  assert.equal(available.status, 'available');
  assert.equal(available.autoInstall, false);
  assert.deepEqual(fourth.events, []);
});

test('a release that fails verification leaves the station running and is not automatically retried', async t => {
  const create = await station(t);
  let now = 1_000_000, stages = 0;
  const {controller, events} = create({
    clock: () => now,
    stage: async () => { stages++; throw new Error('Release checksum mismatch'); },
  });
  await controller.check();
  controller.setAutoInstall(true);
  const failure = await afterAttempt(controller);
  assert.equal(failure.status, 'error');
  assert.match(failure.message, /checksum mismatch/);
  now += 24 * 3_600_000 + 1;
  const nextDay = await controller.check();
  assert.notEqual(nextDay.status, 'installing');
  assert.equal(stages, 1);
  assert.deepEqual(events, []);
});

test('a running opted-in station installs a newly published release on its daily timer', async t => {
  const create = await station(t);
  t.mock.timers.enable({apis: ['Date', 'setTimeout', 'setInterval'], now: 1_000_000});
  const firstCheck = Promise.withResolvers();
  let published = installedVersion, checks = 0;
  const {controller, events, restarted} = create({
    getLatest: async () => {
      checks++;
      firstCheck.resolve();
      return {version: published};
    },
  });
  controller.setAutoInstall(true);
  t.mock.timers.tick(60_000);
  await firstCheck.promise;
  assert.equal((await controller.check()).status, 'current');
  published = latestVersion;
  // The scheduler runs every day from launch. Its startup check ran a minute later.
  t.mock.timers.tick(24 * 3_600_000 - 60_000);
  await Promise.resolve();
  assert.equal(checks, 2);
  assert.equal(await restarted, '');
  assert.deepEqual(events, ['stage', 'lock', 'stop', 'apply', 'restart']);
});

test('a rollback restarts the previous station with the error and suppresses another automatic install', async t => {
  const create = await station(t);
  const {controller, events, restarted} = create({
    apply: async () => { throw new Error('Write failed, files restored'); },
  });
  await controller.check();
  controller.setAutoInstall(true);
  const previousError = await restarted;
  assert.match(previousError, /Write failed, files restored/);
  assert.deepEqual(events, ['stage', 'lock', 'stop', 'restart']);
  controller.close();
  const recovered = create({previousError});
  assert.match((await recovered.controller.check()).message, /Write failed, files restored/);
  const checked = await recovered.controller.check(true);
  assert.equal(checked.autoInstall, true);
  assert.equal(checked.status, 'available');
  assert.deepEqual(recovered.events, []);
  // The operator can retry after correcting the cause of the rollback.
  recovered.controller.install(latestVersion);
  assert.equal(await recovered.restarted, '');
});

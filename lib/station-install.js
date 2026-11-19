import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {compareStationVersions} from './station-release.js';

const run = promisify(execFile);
const manifestName = 'UPDATE-MANIFEST.json';
const required = ['package.json', 'server.js', 'ops/boot-service.mjs', 'lib/http.js', 'public/control.html'];
const launchers = new Set(['start-player.bat', 'start-player.sh']);
const executables = new Set(['start-player.sh', 'ops/package-release.py', 'ops/bundle-yt-dlp.py']);
const manifestLimit = 1024 * 1024;
const fileLimit = 64 * 1024 * 1024;
const totalLimit = 256 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function validPath(name) {
  return typeof name === 'string' && name.length <= 512 && name.split('/').every(part =>
    part.length > 0 && !/[^A-Za-z0-9_.-]/.test(part) && !part.endsWith('.') &&
    !/^(?:data|node_modules|dist|\.git|\.env(?:\..*)?|\.playback-update.*|\.playback-install\.sqlite3(?:-.*)?)$/i.test(part) &&
    !/^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)/i.test(part));
}

function parseManifest(bytes, version) {
  const manifest = JSON.parse(bytes);
  if (manifest?.version !== version || !Array.isArray(manifest.files) || manifest.files.length > 4096) {
    throw new Error('Invalid Playback update manifest or release version.');
  }
  const paths = new Set([manifestName.toLowerCase()]);
  for (const file of manifest.files) {
    if (!validPath(file?.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || paths.has(file.path.toLowerCase())) {
      throw new Error('Invalid file path or checksum in the Playback update manifest.');
    }
    paths.add(file.path.toLowerCase());
  }
  if (!required.every(name => manifest.files.some(file => file.path === name))) {
    throw new Error('The Playback release is missing required station files.');
  }
  return manifest.files;
}

function readPackage(bytes) {
  const pkg = JSON.parse(bytes);
  if (pkg.name !== 'fkeylabs-playback' || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
    throw new Error('Expected a Playback Community installation.');
  }
  return pkg.version;
}

function verifyFile(bytes, file, version) {
  if (sha256(bytes) !== file.sha256) throw new Error(`Checksum mismatch for ${file.path}.`);
  if (file.path === 'package.json' && readPackage(bytes) !== version) {
    throw new Error('The package version does not match the selected release.');
  }
}

async function statIfPresent(file) {
  try { return await fs.lstat(file); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function safeRoot(dir) {
  if (!(await fs.lstat(dir)).isDirectory()) throw new Error(`Expected a station directory at ${dir}.`);
  return fs.realpath(dir);
}

// Refuse symlinks/junctions and nonregular files anywhere below either root.
async function checkedFile(root, relative) {
  let current = root;
  const parts = relative.split('/');
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = await statIfPresent(current);
    if (!stat) return null;
    if (index === parts.length - 1 && stat.isFile()) return stat;
    if (!stat.isDirectory() || index === parts.length - 1) throw new Error(`Unsafe update path: ${current}`);
  }
}

async function readFile(root, relative, limit) {
  const stat = await checkedFile(root, relative);
  if (!stat || stat.size > limit) throw new Error(`Missing or oversized release file: ${relative}`);
  return fs.readFile(path.join(root, relative));
}

function contains(dir, candidate) {
  if (process.platform === 'darwin') {
    // Most macOS volumes are case-insensitive even though path.relative isn't.
    dir = dir.toLowerCase();
    candidate = candidate.toLowerCase();
  }
  const relative = path.relative(path.toNamespacedPath(dir), path.toNamespacedPath(candidate));
  return relative === '' || !(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative));
}

// Read individual, manifest-selected members to stdout. The archive tool never
// creates paths, symlinks, or files on disk. Windows ships bsdtar; Unix
// installations use unzip.
async function readMember(archive, name, maxBuffer) {
  const windows = process.platform === 'win32';
  const command = windows ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'unzip';
  const args = windows ? ['-xOf', archive] : ['-p', archive];
  try {
    const result = await run(command, [...args, 'Playback/' + name], {
      encoding: 'buffer', windowsHide: true, maxBuffer, timeout: 60000,
    });
    return result.stdout;
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Install ${windows ? 'Windows tar.exe' : 'unzip'} to extract Playback updates.`);
    throw new Error(`Unable to read ${name} from the Playback release ZIP.`, {cause: error});
  }
}

export async function stageStationArchive(archive, stageDir, expectedVersion) {
  archive = path.resolve(archive);
  await fs.mkdir(stageDir, {recursive: true, mode: 0o700});
  const source = path.join(await safeRoot(stageDir), 'Playback');
  const manifest = await readMember(archive, manifestName, manifestLimit);
  const files = parseManifest(manifest, expectedVersion);
  await fs.mkdir(source, {mode: 0o700});
  try {
    let total = 0;
    for (const file of files) {
      const bytes = await readMember(archive, file.path, Math.min(fileLimit, totalLimit - total));
      total += bytes.length;
      verifyFile(bytes, file, expectedVersion);
      const dest = path.join(source, file.path);
      await fs.mkdir(path.dirname(dest), {recursive: true, mode: 0o700});
      await fs.writeFile(dest, bytes, {flag: 'wx', mode: executables.has(file.path) ? 0o755 : 0o644});
    }
    await fs.writeFile(path.join(source, manifestName), manifest, {flag: 'wx'});
    return source;
  } catch (error) {
    await fs.rm(source, {recursive: true, force: true});
    throw error;
  }
}

export async function applyStationRelease(sourceDir, targetDir, expectedVersion, {dataDir} = {}) {
  const source = await safeRoot(sourceDir);
  const target = await safeRoot(targetDir);
  if (contains(source, target) || contains(target, source) || await statIfPresent(path.join(target, '.git'))) {
    throw new Error('Update an extracted installation in a separate directory from the staged release.');
  }
  const data = path.resolve(dataDir ?? path.join(target, 'data'));
  const protectedDirs = [data];
  if (await statIfPresent(data)) protectedDirs.push(await fs.realpath(data));
  const installed = readPackage(await readFile(target, 'package.json', manifestLimit));
  if (compareStationVersions(expectedVersion, installed) <= 0) throw new Error('Playback already has this version or a newer one.');
  const manifest = await readFile(source, manifestName, manifestLimit);
  const files = parseManifest(manifest, expectedVersion);
  // Install the manifest last so it continues to identify the installed release.
  const entries = [...files, {path: manifestName, sha256: sha256(manifest)}];
  const transaction = path.join(target, '.playback-update-transaction');
  if (protectedDirs.some(dir => contains(dir, transaction) || contains(transaction, dir))) {
    throw new Error('The station data directory overlaps the update workspace.');
  }
  try { await fs.mkdir(transaction, {mode: 0o700}); }
  catch (error) {
    if (error.code === 'EEXIST') {
      const conflict = new Error(`A previous update is active or requires recovery at ${transaction}.`);
      conflict.recoveryRequired = true;
      throw conflict;
    }
    throw error;
  }
  const prepared = [];
  const changes = [];
  const createdDirectories = [];
  let keepBackup = false;
  try {
    let total = 0;
    for (const file of entries) {
      const dest = path.join(target, file.path);
      if (protectedDirs.some(dir => contains(dir, dest) || contains(dest, dir))) {
        throw new Error(`Release file overlaps the station data directory: ${file.path}`);
      }
      const old = await checkedFile(target, file.path);
      const bytes = await readFile(source, file.path, Math.min(fileLimit, totalLimit - total));
      total += bytes.length;
      verifyFile(bytes, file, expectedVersion);
      if (old && launchers.has(file.path.toLowerCase())) continue;
      const next = path.join(transaction, 'new', file.path);
      const backup = path.join(transaction, 'old', file.path);
      await fs.mkdir(path.dirname(next), {recursive: true});
      await fs.mkdir(path.dirname(backup), {recursive: true});
      await fs.writeFile(next, bytes, {flag: 'wx', mode: executables.has(file.path) ? 0o755 : 0o644});
      prepared.push({relative: file.path, dest, next, backup, existed: Boolean(old)});
    }
    for (const entry of prepared) {
      if (Boolean(await checkedFile(target, entry.relative)) !== entry.existed) {
        throw new Error(`A station file changed while preparing the update: ${entry.relative}`);
      }
      const parent = path.dirname(entry.dest);
      const firstCreated = await fs.mkdir(parent, {recursive: true});
      if (firstCreated) {
        for (let dir = parent; contains(firstCreated, dir); dir = path.dirname(dir)) {
          createdDirectories.push(dir);
        }
      }
      if (entry.existed) await fs.rename(entry.dest, entry.backup);
      changes.push(entry);
      await fs.rename(entry.next, entry.dest);
    }
  } catch (error) {
    for (const entry of changes.reverse()) {
      try {
        if (entry.existed) await fs.rename(entry.backup, entry.dest);
        else await fs.rm(entry.dest, {force: true});
      } catch {
        keepBackup = true;
      }
    }
    for (const directory of createdDirectories.sort((a, b) => b.length - a.length)) {
      try { await fs.rmdir(directory); }
      catch (cleanupError) {
        // Concurrently created station files belong to the operator.
        if (cleanupError.code !== 'ENOTEMPTY' && cleanupError.code !== 'ENOENT') keepBackup = true;
      }
    }
    if (keepBackup) {
      const failed = new Error(`The installation needs recovery from ${transaction}. Keep Playback stopped.`, {cause: error});
      failed.recoveryRequired = true;
      throw failed;
    }
    throw error;
  } finally {
    if (!keepBackup) await fs.rm(transaction, {recursive: true, force: true});
  }
}

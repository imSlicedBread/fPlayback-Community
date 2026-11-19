import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

export function isPackagedStation(root) {
  return !fs.existsSync(path.join(root, '.git')) && fs.existsSync(path.join(root, 'UPDATE-MANIFEST.json'));
}

// A station can use a custom DATA_DIR. Share a read lock at the installation
// itself so two stations sharing application files cannot update one another.
function openGuard(filename, readOnly) {
  const entry = fs.lstatSync(filename, {throwIfNoEntry: false});
  if (entry && (!entry.isFile() || entry.nlink !== 1)) throw new Error('Invalid installation lock file.');
  return new DatabaseSync(filename, {readOnly});
}

export function openInstallLock(root, {readOnly = false} = {}) {
  const filename = path.join(root, '.playback-install.sqlite3');
  const db = openGuard(filename, readOnly);
  function read() { db.exec('BEGIN; SELECT count(*) FROM sqlite_schema'); }
  try { read(); } catch (error) { db.close(); throw error; }
  return {
    exclusive() {
      // Serialize lock upgrades. A second updater must not obtain the write
      // lock in the gap between a running station's read and write transactions.
      const writers = openGuard(filename + '-writer', false);
      try {
        writers.exec('BEGIN IMMEDIATE');
        db.exec('COMMIT');
        try { db.exec('BEGIN EXCLUSIVE'); }
        catch (error) { read(); throw error; }
      }
      catch (error) {
        if ([5, 6].includes(error.errcode)) throw new Error('Stop the other stations using this Playback folder before updating.');
        throw error;
      } finally { writers.close(); }
    },
    close() { db.close(); },
  };
}

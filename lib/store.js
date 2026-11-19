import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export function mkdirPrivate(p) { fs.mkdirSync(p, { recursive: true, mode: 0o700 }); }
export function privateSecret(dir, name, bytes=32) {
  mkdirPrivate(dir);
  const p=path.join(dir,name);
  function readKey() {
    const key=fs.readFileSync(p,'utf8').trim();
    if(key.length!==bytes*2 || !/^[a-fA-F0-9]+$/.test(key))
      throw new Error(`Invalid credential file ${name}. Restore its original value from a trusted backup.`);
    return key;
  }
  function readExisting() {
    try { return readKey(); }
    catch(error) { if(error.code==='ENOENT')return null; throw error; }
  }
  const existing=readExisting();
  if(existing!==null)return existing;
  // Serialize first publication, including on volumes without hard links.
  // The empty guard file stays in place; a crashed process loses its OS lock.
  const guard=new DatabaseSync(path.join(dir,'.credential-init.sqlite3'));
  try {
    guard.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
    const published=readExisting();
    if(published!==null)return published;
    const key=crypto.randomBytes(bytes).toString('hex');
    const temp=path.join(dir,`.${name}.${crypto.randomUUID()}.tmp`);
    const fd=fs.openSync(temp,'wx',0o600);
    try {
      try { fs.writeFileSync(fd,key+'\n'); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      fs.renameSync(temp,p);
      if(process.platform!=='win32'){
        const parent=fs.openSync(dir,'r');
        try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
      }
    } finally { fs.rmSync(temp,{force:true}); }
    return key;
  } finally { guard.close(); }
}

export class DurableStore {
  constructor(dir) { this.dir=path.resolve(dir); mkdirPrivate(this.dir); this.file=path.join(this.dir,'state.json'); this.previous=path.join(this.dir,'state.previous.json'); }
  load() {
    try { return JSON.parse(fs.readFileSync(this.file,'utf8')); }
    catch(e) {
      if(e.code==='ENOENT')return null;
      // Do not silently discard corrupted state. An operator can recover from backup manually.
      throw new Error(`Cannot read ${this.file}: ${e.message}. Restore from state.previous.json if necessary.`);
    }
  }
  write(state) {
    const raw=JSON.stringify(state)+'\n';
    const temp=path.join(this.dir,`state-${process.pid}-${crypto.randomBytes(5).toString('hex')}.tmp`);
    const fd=fs.openSync(temp,fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,0o600);
    try { fs.writeFileSync(fd,raw);fs.fsyncSync(fd); } finally {fs.closeSync(fd);}
    try {
      if(fs.existsSync(this.file)) fs.copyFileSync(this.file,this.previous);
      fs.renameSync(temp,this.file);
      // Sync containing directory after rename where supported.
      if(process.platform!=='win32') {let d;try {d=fs.openSync(this.dir,'r');fs.fsyncSync(d);}catch{}finally{if(d!==undefined)fs.closeSync(d);}}
    } catch(e) { try{fs.unlinkSync(temp);}catch{} throw e; }
  }
  backupLegacy(raw) {
    if(raw?.schemaVersion===2)return;
    const name=path.join(this.dir,raw?.schemaVersion===1?'state.before-rotation-migration.json':'state.before-production-migration.json');
    if(!fs.existsSync(name))fs.copyFileSync(this.file,name);
  }
}

export function processLock(dir) {
  mkdirPrivate(dir);
  const file=path.join(dir,'.instance.lock');
  // This stable file is never unlinked. SQLite releases the writer lock even
  // on process termination, before another starter inspects the legacy marker.
  const guard=new DatabaseSync(path.join(dir,'.instance-lock.sqlite3'));
  try {
    try { guard.exec('BEGIN IMMEDIATE'); }
    catch(error) {
      if(error.errcode!==5 && error.errcode!==6)throw error;
      throw Object.assign(new Error('Playback data is already in use. Check the existing dashboard or Windows automatic startup.'),{code:'PLAYBACK_INSTANCE_LOCKED'});
    }
    const marker=path.join(dir,`.instance-${crypto.randomUUID()}.tmp`);
    try {
      fs.writeFileSync(marker,String(process.pid),{flag:'wx',mode:0o600});
      acquirePidMarker(file,marker);
    } finally { fs.rmSync(marker,{force:true}); }
  } catch(error) { guard.close(); throw error; }
  let released=false;
  return ()=>{
    if(released)return;
    released=true;
    try { if(fs.readFileSync(file,'utf8').trim()===String(process.pid))fs.unlinkSync(file); }
    catch(error) { if(error.code!=='ENOENT')throw error; }
    finally { guard.close(); }
  };
}

function acquirePidMarker(file,marker) {
  for(let n=0;n<2;n++) {
    try {
      try { fs.linkSync(marker,file); }
      catch(error) {
        if(!['ENOSYS','ENOTSUP','EOPNOTSUPP','EPERM','EINVAL'].includes(error.code))throw error;
        fs.copyFileSync(marker,file,fs.constants.COPYFILE_EXCL);
      }
      return;
    }
    catch(e) {
      if(e.code!=='EEXIST')throw e;
      const pid=Number(fs.readFileSync(file,'utf8'));
      if(Number.isSafeInteger(pid)&&pid>0) {
        let denied=false;
        try {process.kill(pid,0);}
        catch(error) {
          if(error.code==='ESRCH') {fs.unlinkSync(file);continue;}
          if(error.code!=='EPERM')throw error;
          // Windows may deny a probe of a process owned by the startup service.
          // Access denied does not prove it exited: never discard that lock.
          denied=true;
        }
        throw Object.assign(new Error(
          `Playback data is already in use or locked by PID ${pid}${denied?' (Windows denied the process check)':''}. `+
          'Playback may already be running through Windows automatic startup. '+
          'Open the existing dashboard, or stop the existing Playback process/startup task before starting another copy. '+
          'Do not delete the instance lock while that process may still be running.'
        ),{code:'PLAYBACK_INSTANCE_LOCKED',pid});
      }
      throw Object.assign(new Error('Unreadable instance PID. Stop any existing Playback process before recovering its lock file.'),{code:'PLAYBACK_INSTANCE_LOCKED'});
    }
  }
  throw new Error('Could not acquire instance lock');
}

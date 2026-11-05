import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Windows boot task is a real AtStartup task running as LOCAL SERVICE, not SYSTEM',()=>{
  const setup=read('ops/register-autostart.ps1');
  assert.match(setup,/New-ScheduledTaskTrigger\s+-AtStartup/i);
  assert.match(setup,/LOCALSERVICE/);
  assert.match(setup,/-LogonType\s+ServiceAccount/i);
  assert.match(setup,/icacls\.exe\s+\$dataDir\s+\/grant/);
  assert.match(setup,/RestartCount\s+99/);
  assert.match(setup,/MultipleInstances\s+IgnoreNew/);
  assert.match(setup,/Unregister-ScheduledTask\s+-TaskName\s+\$oldTask/i);
  assert.doesNotMatch(setup,/\$servicePrincipal\s*=\s*New-ScheduledTaskPrincipal\s+-UserId\s+['"]SYSTEM['"]/i);
  assert.match(read('ops/open-dashboard-at-logon.ps1'),/\/control/);
  assert.match(setup,/New-ScheduledTaskTrigger\s+-AtLogOn/i);
  assert.match(read('ops/unregister-autostart.ps1'),/Unregister-ScheduledTask/);
  assert.match(read('INSTALL-AUTO-START.bat'),/register-autostart\.ps1[" ]+\-StartNow/i);
  assert.match(read('UNINSTALL-AUTO-START.bat'),/unregister-autostart\.ps1/i);
  assert.match(read('CHECK-AUTO-START.bat'),/check-autostart\.ps1/i);
  assert.match(read('ops/package-release.py'),/'INSTALL-AUTO-START\.bat'/);
});

test('Windows PowerShell 5.1 scripts parse without errors on Windows', {
  skip:process.platform!=='win32'?'requires Windows PowerShell 5.1':false
},()=>{
  const files=['register-autostart.ps1','unregister-autostart.ps1','open-dashboard-at-logon.ps1','check-autostart.ps1'];
  for(const file of files){
    const full=path.join(root,'ops',file).replaceAll("'","''");
    const script=`$tokens=$null; $errors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${full}', [ref]$tokens, [ref]$errors); if($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }`;
    const check=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8'});
    assert.equal(check.status,0,`${file} syntax failed:\n${check.stderr}\n${check.stdout}`);
  }
});

test('Headless boot entrypoint serves Playback on a fixed port and writes a local log',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'playback-boot-'));
  const listener=net.createServer();
  await new Promise((resolve,reject)=>listener.listen(0,'127.0.0.1',err=>err?reject(err):resolve()));
  const port=listener.address().port;
  await new Promise((resolve,reject)=>listener.close(err=>err?reject(err):resolve()));
  const entry=path.join(root,'ops','boot-service.mjs');
  const child=spawn(process.execPath,[entry,'--port',String(port)],{
    cwd:root,env:{...process.env,DATA_DIR:dir,PB_OPEN_BROWSER:'1'},stdio:['ignore','pipe','pipe']
  });
  let errors=''; child.stderr.setEncoding('utf8'); child.stderr.on('data',data=>errors+=data);
  t.after(async()=>{
    if(child.exitCode===null){
      const closed=new Promise(resolve=>child.once('close',resolve));
      child.kill();
      await Promise.race([closed,wait(2000)]);
    }
    fs.rmSync(dir,{recursive:true,force:true});
  });
  const until=Date.now()+8000;
  let health;
  while(Date.now()<until && child.exitCode===null && !health){
    try{
      const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(750)});
      if(response.ok)health=await response.json();
    }catch{}
    if(!health)await wait(90);
  }
  assert.equal(health?.ok,true,`Boot server failed: ${errors}`);
  assert.equal(health?.app,'fKey Playback');
  const version=JSON.parse(read('package.json')).version;
  assert.equal(health.version,version);
  assert.ok(fs.existsSync(path.join(dir,'boot-service.log')));
  const log=fs.readFileSync(path.join(dir,'boot-service.log'),'utf8');
  assert.match(log,/Starting fKey Playback/);
  assert.match(log,/ready/);
  assert.ok(log.includes(`fKey Playback made by fKey Labs Inc. ${version} ready`));
  assert.equal(log.includes('Could not open browser automatically'),false);
});

test('Sign-in launcher waits for backend health before opening the browser and OBS once',{
 skip:process.platform!=='win32'?'requires Windows PowerShell 5.1':false
},()=>{
 const entry=path.join(root,'ops','open-dashboard-at-logon.ps1').replaceAll("'","''");
 const obs=process.execPath.replaceAll("'","''");
 const script=`$script:attempts=0; function Invoke-RestMethod { $script:attempts++; if($script:attempts -lt 3){ throw 'not ready' }; return @{ok=$true;app='fKey Playback'} }; function Start-Sleep {}; function Get-Process {}; function Start-Process { param($FilePath,$WorkingDirectory,$WindowStyle); if($script:attempts -ne 3){throw 'launched before ready'}; Write-Output ('LAUNCH '+$FilePath); if($WorkingDirectory){Write-Output ('WORKDIR '+$WorkingDirectory); Write-Output ('WINDOWSTYLE '+$WindowStyle)} }; & '${entry}' -ObsPath '${obs}'`;
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const launches=result.stdout.split(/\r?\n/).filter(s=>s.startsWith('LAUNCH '));
 assert.equal(launches.length,2);assert.equal(launches[0],'LAUNCH http://127.0.0.1:4177/control');assert.equal(launches[1],`LAUNCH ${process.execPath}`);assert.ok(result.stdout.includes(`WORKDIR ${path.dirname(process.execPath)}`));assert.ok(result.stdout.includes('WINDOWSTYLE Normal'),'OBS must open visibly in the signed-in desktop');
});

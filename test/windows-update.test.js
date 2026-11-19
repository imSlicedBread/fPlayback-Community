import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const updater = fileURLToPath(new URL('../ops/update-playback.ps1', import.meta.url));
const quote = value => "'" + value.replaceAll("'", "''") + "'";

test('Windows updater keeps the station and startup configuration through updates and copy failures', {
  skip: process.platform !== 'win32',
}, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playback-update-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const installed = path.join(root, 'Installed Playback');
  const release = path.join(root, 'Extracted Playback');
  const packageJson = version => JSON.stringify({name: 'fkeylabs-playback', version});
  const write = (dir, relative, contents) => {
    const file = path.join(dir, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, contents);
  };
  const files = {
    'package.json': packageJson('1.8.0'),
    'server.js': 'new server',
    'ops/boot-service.mjs': 'new boot service',
    'ops/update-station.mjs': `
      import fs from 'node:fs';
      import path from 'node:path';
      const [mode, stage] = process.argv.slice(2);
      if (mode !== '--stage' || !path.isAbsolute(stage)) process.exit(1);
      const root = path.resolve(import.meta.dirname, '..', '..');
      fs.writeFileSync(path.join(root, 'last-stage.txt'), stage);
      if (fs.existsSync(path.join(root, 'offer-release'))) {
        fs.cpSync(path.join(root, 'Extracted Playback'), path.join(stage, 'Playback'), {recursive: true});
      }
    `,
    'lib/http.js': 'new http',
    'public/control.html': 'new control',
    'start-player.bat': 'new launcher',
    'public/new.html': 'new page',
  };
  for (const [name, contents] of Object.entries(files)) {
    write(release, name, contents);
    if (name !== 'public/new.html') {
      write(installed, name, name === 'package.json' ? packageJson('1.7.19') : 'old ' + name);
    }
  }
  write(installed, 'data/playlist.sqlite3', 'queue data');
  write(installed, '.env', 'local settings');
  write(release, 'UPDATE-MANIFEST.json', JSON.stringify({
    version: '1.8.0',
    files: Object.entries(files).map(([name, contents]) => ({
      path: name,
      sha256: createHash('sha256').update(contents).digest('hex'),
    })),
  }));

  const harness = String.raw`
. ${quote(updater)}
$installed = ${quote(installed)}
$release = ${quote(release)}
$entry = "$installed\ops\.\boot-service.mjs"
$action = New-ScheduledTaskAction -Execute ${quote(process.execPath)} -WorkingDirectory $installed -Argument ('"{0}" --port 4199' -f $entry)
$task = [pscustomobject]@{
    Actions = @($action)
    Settings = [pscustomobject]@{ Enabled = $true }
    State = 'Running'
}
$events = [Collections.Generic.List[string]]::new()
function Get-ScheduledTask { $task }
function Disable-ScheduledTask { $events.Add('disable'); $task.Settings.Enabled = $false }
function Stop-ScheduledTask { $events.Add('stop'); $task.State = 'Disabled' }
function Enable-ScheduledTask { $events.Add('enable'); $task.Settings.Enabled = $true; $task.State = 'Ready' }
function Start-ScheduledTask {
    $events.Add('start')
    if (-not $task.Settings.Enabled) { throw 'Task was not enabled before restart' }
    $task.State = 'Running'
}
function Test-PlaybackPort { $task.State -eq 'Running' }
function Invoke-RestMethod {
    param($Uri, [switch]$UseBasicParsing, $TimeoutSec)
    if ($Uri -ne 'http://127.0.0.1:4199/api/health') { throw 'Wrong port' }
    $events.Add('health')
    @{ ok = $true; app = 'fKey Playback'; version = (Get-PlaybackPackageVersion $installed).ToString() }
}
function Assert-Text($file, $expected) {
    if ((Get-Content -LiteralPath $file -Raw) -ne $expected) { throw "Unexpected contents: $file" }
}
function Assert-Events($expected) {
    if (($events -join ',') -ne $expected) { throw "Unexpected task actions: $events" }
    $events.Clear()
}

New-Item -Path (Join-Path $installed '.git') -ItemType Directory | Out-Null
try { Update-Playback $release; throw 'Git checkout accepted' }
catch { if ($_.Exception.Message -notmatch 'source checkout') { throw } }
Remove-Item -LiteralPath (Join-Path $installed '.git')
Assert-Events ''

$env:DATA_DIR = 'lib'
try { Update-Playback $release; throw 'Custom data directory overwritten' }
catch { if ($_.Exception.Message -notmatch 'overlaps') { throw } }
Remove-Item Env:\DATA_DIR
Assert-Events ''

$alias = Join-Path (Split-Path -Parent $installed) 'Playback data alias'
New-Item -ItemType Junction -Path $alias -Target $installed | Out-Null
try {
    $env:DATA_DIR = Join-Path $alias 'public\new.html'
    try { Update-Playback $release; throw 'Aliased data directory overwritten' }
    catch { if ($_.Exception.Message -notmatch 'overlaps') { throw } }
    Assert-Events ''
    if (Test-Path -LiteralPath $env:DATA_DIR) { throw 'Update created a file at a protected data path' }
} finally {
    Remove-Item Env:\DATA_DIR
    [IO.Directory]::Delete($alias)
}

$installedManifest = Join-Path $installed 'UPDATE-MANIFEST.json'
$privateFile = Join-Path $installed 'data/playlist.sqlite3'
New-Item -ItemType HardLink -Path $installedManifest -Target $privateFile | Out-Null
try { Update-Playback $release; throw 'Linked manifest overwritten' }
catch { if ($_.Exception.Message -notmatch 'linked path') { throw } }
Remove-Item -LiteralPath $installedManifest
Assert-Events ''

$server = Join-Path $release 'server.js'
[IO.File]::WriteAllText($server, 'damaged')
try { Update-Playback $release; throw 'Invalid release was accepted' }
catch { if ($_.Exception.Message -notmatch 'missing or damaged') { throw } }
Assert-Events ''
Assert-Text (Join-Path $installed 'server.js') 'old server.js'
[IO.File]::WriteAllText($server, 'new server')

$otherUpdater = Open-PlaybackInstallLock $action.Execute $installed
try {
    try { Update-Playback $release; throw 'Concurrent updater accepted' }
    catch { if ($_.Exception.Message -notmatch 'Could not lock the installation') { throw } }
} finally { Close-PlaybackInstallLock $otherUpdater }
Assert-Events 'disable,stop,enable,start'
Assert-Text (Join-Path $installed 'server.js') 'old server.js'

[IO.File]::WriteAllText($installedManifest, 'previous release manifest')
function Copy-Item {
    param($LiteralPath, $Destination, [switch]$Force)
    Microsoft.PowerShell.Management\Copy-Item @PSBoundParameters
    if ([IO.Path]::GetFullPath($LiteralPath) -eq [IO.Path]::GetFullPath((Join-Path $release 'UPDATE-MANIFEST.json'))) {
        throw 'Simulated interrupted copy'
    }
}
try { Update-Playback $release; throw 'Copy failure was ignored' }
catch { if ($_.Exception.Message -ne 'Simulated interrupted copy') { throw } }
Assert-Events 'disable,stop,enable,start'
Assert-Text (Join-Path $installed 'server.js') 'old server.js'
if (Test-Path -LiteralPath (Join-Path $installed 'public/new.html')) { throw 'New file was not rolled back' }
if ((Get-PlaybackPackageVersion $installed).ToString() -ne '1.7.19') { throw 'Version was not restored' }
Assert-Text $installedManifest 'previous release manifest'
Remove-Item -LiteralPath Function:\Copy-Item
Remove-Item -LiteralPath $installedManifest

Update-Playback $release
Assert-Events 'disable,stop,enable,start,health'
Assert-Text (Join-Path $installed 'server.js') 'new server'
Assert-Text (Join-Path $installed 'public/new.html') 'new page'
Assert-Text (Join-Path $installed 'start-player.bat') 'old start-player.bat'
Assert-Text (Join-Path $installed 'data/playlist.sqlite3') 'queue data'
Assert-Text (Join-Path $installed '.env') 'local settings'
Assert-Text $installedManifest (Get-Content -LiteralPath (Join-Path $release 'UPDATE-MANIFEST.json') -Raw)

# The installed shortcut stages from the validated task's node.exe. A current
# install leaves the running station alone; an available release is applied.
$lastStage = Join-Path (Split-Path -Parent $installed) 'last-stage.txt'
Update-Playback $installed
Assert-Events ''
if (Test-Path -LiteralPath (Get-Content -LiteralPath $lastStage -Raw)) { throw 'Current release left a staging folder' }
$offer = Join-Path (Split-Path -Parent $installed) 'offer-release'
New-Item -Path $offer -ItemType File | Out-Null
$nextManifest = Get-Content -LiteralPath $installedManifest -Raw | ConvertFrom-Json
$nextManifest.version = '1.8.1'
$packageFile = Join-Path $release 'package.json'
[IO.File]::WriteAllText($packageFile, '{"name":"fkeylabs-playback","version":"1.8.1"}')
($nextManifest.files | Where-Object path -EQ 'package.json').sha256 = (Get-PlaybackFileHash $packageFile).ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $release 'UPDATE-MANIFEST.json'), ($nextManifest | ConvertTo-Json -Depth 4))
Update-Playback $installed
Assert-Events 'disable,stop,enable,start,health'
if ((Get-PlaybackPackageVersion $installed).ToString() -ne '1.8.1') { throw 'Installed shortcut did not update to the staged version' }
if (Test-Path -LiteralPath (Get-Content -LiteralPath $lastStage -Raw)) { throw 'Install left a staging folder' }

[IO.File]::AppendAllText((Join-Path $installed 'ops/update-station.mjs'), 'invalid')
try { Update-Playback $installed; throw 'Invalid installed staging tool accepted' }
catch { if ($_.Exception.Message -notmatch 'installed update files') { throw } }
Assert-Events ''

$task.Settings.Enabled = $false
$task.State = 'Disabled'
Update-Playback $release
Assert-Events ''
if ($task.Settings.Enabled -or $task.State -ne 'Disabled') { throw 'Update activated a disabled task' }
`;
  const encoded = Buffer.from(harness, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.equal(result.status, 0, [result.error?.message, result.stderr, result.stdout].filter(Boolean).join('\n'));
});

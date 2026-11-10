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
    'package.json': packageJson('1.7.17'),
    'server.js': 'new server',
    'ops/boot-service.mjs': 'new boot service',
    'lib/http.js': 'new http',
    'public/control.html': 'new control',
    'start-player.bat': 'new launcher',
    'public/new.html': 'new page',
  };
  for (const [name, contents] of Object.entries(files)) {
    write(release, name, contents);
    if (name !== 'public/new.html') {
      write(installed, name, name === 'package.json' ? packageJson('1.7.16') : 'old ' + name);
    }
  }
  write(installed, 'data/playlist.sqlite3', 'queue data');
  write(installed, '.env', 'local settings');
  write(release, 'UPDATE-MANIFEST.json', JSON.stringify({
    version: '1.7.17',
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
$task = [pscustomobject]@{
    Actions = @([pscustomobject]@{
        Execute = 'C:\Program Files\nodejs\node.exe'
        WorkingDirectory = $installed
        Argument = '"{0}" --port 4199' -f $entry
    })
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

$server = Join-Path $release 'server.js'
[IO.File]::WriteAllText($server, 'damaged')
try { Update-Playback $release; throw 'Invalid release was accepted' }
catch { if ($_.Exception.Message -notmatch 'missing or damaged') { throw } }
Assert-Events ''
Assert-Text (Join-Path $installed 'server.js') 'old server.js'
[IO.File]::WriteAllText($server, 'new server')

function Copy-Item {
    param($LiteralPath, $Destination, [switch]$Force)
    Microsoft.PowerShell.Management\Copy-Item @PSBoundParameters
    if ([IO.Path]::GetFullPath($LiteralPath) -eq [IO.Path]::GetFullPath((Join-Path $release 'public/new.html'))) {
        throw 'Simulated interrupted copy'
    }
}
try { Update-Playback $release; throw 'Copy failure was ignored' }
catch { if ($_.Exception.Message -ne 'Simulated interrupted copy') { throw } }
Assert-Events 'disable,stop,enable,start'
Assert-Text (Join-Path $installed 'server.js') 'old server.js'
if (Test-Path -LiteralPath (Join-Path $installed 'public/new.html')) { throw 'New file was not rolled back' }
if ((Get-PlaybackPackageVersion $installed).ToString() -ne '1.7.16') { throw 'Version was not restored' }
Remove-Item -LiteralPath Function:\Copy-Item

Update-Playback $release
Assert-Events 'disable,stop,enable,start,health'
Assert-Text (Join-Path $installed 'server.js') 'new server'
Assert-Text (Join-Path $installed 'public/new.html') 'new page'
Assert-Text (Join-Path $installed 'start-player.bat') 'old start-player.bat'
Assert-Text (Join-Path $installed 'data/playlist.sqlite3') 'queue data'
Assert-Text (Join-Path $installed '.env') 'local settings'

$task.Settings.Enabled = $false
$task.State = 'Disabled'
Update-Playback $release
Assert-Events ''
if ($task.Settings.Enabled -or $task.State -ne 'Disabled') { throw 'Update activated a disabled task' }
`;
  const encoded = Buffer.from(harness, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    timeout: 20000,
  });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr + '\n' + result.stdout);
});

#Requires -Version 5.1
<#
Install fKey Playback as an unattended Windows boot task.
Run from INSTALL-AUTO-START.bat (elevates through UAC), or:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\register-autostart.ps1 -StartNow
Node runs under the unprivileged Windows LOCAL SERVICE account, not SYSTEM.
#>
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)] [int] $Port = 4177,
    [switch] $StartNow,
    [switch] $NoDashboardAtLogon,
    [switch] $StartOBSAtLogon,
    [string] $ObsPath = ''
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$bootTask = 'fKey Playback - Boot Server'
$dashboardTask = 'fKey Playback - Dashboard at Sign-in'
$oldTask = 'fKeyLabs Playback'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Host 'Windows boot startup requires administrator approval. Requesting UAC elevation...'
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Port {1}' -f $PSCommandPath, $Port
    if ($StartNow) { $arguments += ' -StartNow' }
    if ($NoDashboardAtLogon) { $arguments += ' -NoDashboardAtLogon' }
    if ($StartOBSAtLogon) { $arguments += ' -StartOBSAtLogon' }
    if ($ObsPath) {
        if ($ObsPath.Contains('"')) { throw 'Invalid OBS executable path.' }
        $arguments += ' -ObsPath "{0}"' -f $ObsPath
    }
    try {
        $elevated = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -PassThru -Wait
    } catch {
        Write-Error "Administrator approval was not granted: $($_.Exception.Message)"
        exit 1
    }
    exit $elevated.ExitCode
}

if ($root.StartsWith('\\')) {
    throw 'Install Playback on a local fixed drive (for example C:\Playback), not a network share.'
}
if ($env:USERPROFILE) {
    $profileRoot = [IO.Path]::GetFullPath($env:USERPROFILE).TrimEnd('\') + '\'
    if ($root.StartsWith($profileRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Move Playback out of your user profile (Desktop/Downloads) to C:\Playback first. LOCAL SERVICE cannot reliably read private user folders before sign-in.'
    }
}

$node = (Get-Command 'node.exe' -ErrorAction Stop).Source
if ($env:USERPROFILE) {
    if ($node.StartsWith($profileRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Node.js is installed inside your user profile. Install Node.js for all users before enabling boot startup.'
    }
}
$nodeVersionText = (& $node --version).Trim().TrimStart('v')
try { $nodeVersion = [version]$nodeVersionText } catch { throw "Cannot determine Node.js version: $nodeVersionText" }
if ($nodeVersion -lt [version]'22.13.0') { throw 'Node.js 22.13.0 or newer is required.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'server.js') -PathType Leaf)) {
    throw 'server.js is missing. Extract the complete release before installing startup.'
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'ops\boot-service.mjs') -PathType Leaf)) {
    throw 'The boot-service.mjs entrypoint is missing.'
}

# Only data/ is writable by LOCAL SERVICE; app source files keep their original
# permissions. Running a user-editable Node app as SYSTEM would be unsafe.
if (Test-Path -LiteralPath (Join-Path $root 'UPDATE-MANIFEST.json') -PathType Leaf) {
    # LOCAL SERVICE can take a read lock on this empty SQLite database before
    # sign-in. An updater needs the exclusive lock to change station files.
    $guard = Join-Path $root '.playback-install.sqlite3'
    if (-not (Test-Path -LiteralPath $guard)) {
        [IO.File]::Open($guard, [IO.FileMode]::CreateNew).Dispose()
    }
}
$dataDir = Join-Path $root 'data'
if ($StartOBSAtLogon) {
    if ($NoDashboardAtLogon) { throw 'OBS startup requires the interactive sign-in task.' }
    if (-not $ObsPath) {
        foreach ($base in @($env:ProgramW6432, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
            if ($base) {
                $candidate = Join-Path $base 'obs-studio\bin\64bit\obs64.exe'
                if (Test-Path -LiteralPath $candidate -PathType Leaf) { $ObsPath = $candidate; break }
            }
        }
    }
    if (-not $ObsPath -or $ObsPath.Contains('"') -or -not (Test-Path -LiteralPath $ObsPath -PathType Leaf)) {
        throw 'OBS was not found. Run this installer with -StartOBSAtLogon -ObsPath "C:\path\to\obs64.exe".'
    }
    $ObsPath = (Resolve-Path -LiteralPath $ObsPath).Path
}
New-Item -Path $dataDir -ItemType Directory -Force | Out-Null
& icacls.exe $dataDir /grant '*S-1-5-19:(OI)(CI)M' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not grant LOCAL SERVICE write access to $dataDir" }

$bootEntry = Join-Path $root 'ops\boot-service.mjs'
$arguments = '"{0}" --port {1}' -f $bootEntry, $Port
$action = New-ScheduledTaskAction -Execute $node -Argument $arguments -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtStartup
$servicePrincipal = New-ScheduledTaskPrincipal -UserId 'LOCALSERVICE' -LogonType ServiceAccount -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $bootTask -Description 'fKey Playback local 24/7 backend: starts on Windows boot without sign-in' `
    -Action $action -Trigger $trigger -Principal $servicePrincipal -Settings $settings -Force | Out-Null

if (-not $NoDashboardAtLogon) {
    # Only the user's desktop may open a browser. The boot task never does.
    $user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $powershell = Join-Path $PSHOME 'powershell.exe'
    $openScript = Join-Path $root 'ops\open-dashboard-at-logon.ps1'
    $loginArguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -Port {1}' -f $openScript, $Port
    if ($StartOBSAtLogon) { $loginArguments += ' -ObsPath "{0}"' -f $ObsPath }
    $loginAction = New-ScheduledTaskAction -Execute $powershell -Argument $loginArguments -WorkingDirectory $root
    $loginTrigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $loginPrincipal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $loginSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -StartWhenAvailable -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $dashboardTask -Description 'Open fKey Playback dashboard on sign-in when the backend is ready' `
        -Action $loginAction -Trigger $loginTrigger -Principal $loginPrincipal -Settings $loginSettings -Force | Out-Null
} else {
    $existingDashboard = Get-ScheduledTask -TaskName $dashboardTask -ErrorAction SilentlyContinue
    if ($existingDashboard) { Unregister-ScheduledTask -TaskName $dashboardTask -Confirm:$false }
}

# Upgrade: remove v1.0.7's sign-in-only backend task to avoid two servers
# fighting over port 4177. Do not remove any files or station state.
$old = Get-ScheduledTask -TaskName $oldTask -ErrorAction SilentlyContinue
if ($old) { Unregister-ScheduledTask -TaskName $oldTask -Confirm:$false }

if ($StartNow) {
    Start-ScheduledTask -TaskName $bootTask
}
Write-Host "Boot startup installed: $bootTask" -ForegroundColor Green
Write-Host 'Account: LOCAL SERVICE (no user sign-in needed)'
Write-Host "Playback directory: $root"
Write-Host "Dashboard: http://127.0.0.1:$Port/control"
Write-Host "Log file: $dataDir\boot-service.log"
if ($NoDashboardAtLogon) { Write-Host 'Dashboard auto-open at sign-in: off' }
else { Write-Host 'Dashboard auto-open at sign-in: on' }
if ($StartOBSAtLogon) { Write-Host "OBS auto-open after Playback is ready: $ObsPath" }
if ($StartNow) { Write-Host 'Background server start requested. If another Playback is running, stop it first.' }
Write-Host 'OBS must be started in a signed-in desktop session and configured to keep its Browser Source active.'

#Requires -Version 5.1
param([switch] $KeepWindowOpen)
$ErrorActionPreference = 'Stop'

function Get-PlaybackPackageVersion([string] $Root) {
    $package = Get-Content -LiteralPath (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
    if ($package.name -ne 'fkeylabs-playback' -or $package.version -notmatch '^\d+\.\d+\.\d+$') {
        throw "This is not a Playback Community installation: $Root"
    }
    return [version]$package.version
}

function Assert-PlaybackUpdatePath([string] $Path) {
    # An update must never copy through a junction or symlink into another folder.
    while ($Path) {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
        if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Playback cannot update through a linked path: $Path"
        }
        $Path = [IO.Path]::GetDirectoryName($Path)
    }
}

function Test-PlaybackPort([int] $Port) {
    $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    return [bool]($listeners | Where-Object Port -EQ $Port)
}

function Get-PlaybackFileHash([string] $Path) {
    $stream = [IO.File]::OpenRead($Path)
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
        finally { $sha.Dispose() }
    } finally {
        $stream.Dispose()
    }
}

function Update-Playback([string] $Source) {
    $taskName = 'fKey Playback - Boot Server'
    $taskPath = '\'
    $task = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction SilentlyContinue
    if (-not $task) {
        throw 'No Playback boot task was found. For a manual installation, stop Playback, extract the release over the existing installation, and run start-player.bat.'
    }
    $actions = @($task.Actions)
    if ($actions.Count -ne 1 -or [IO.Path]::GetFileName($actions[0].Execute) -ne 'node.exe' -or
        $actions[0].WorkingDirectory -notmatch '^[A-Za-z]:[\\/]' -or
        $actions[0].Argument -notmatch '^"([^"]+)" --port ([0-9]{1,5})$') {
        throw 'The Playback boot task uses an unrecognized command. Its files and task were left untouched.'
    }
    $entry = $Matches[1]
    $port = [int]$Matches[2]
    $target = [IO.Path]::GetFullPath($actions[0].WorkingDirectory).TrimEnd('\')
    $source = [IO.Path]::GetFullPath($Source).TrimEnd('\')
    if ($target -notmatch '^[A-Za-z]:\\.' -or $port -lt 1 -or $port -gt 65535 -or
        $entry -ne (Join-Path $target 'ops\boot-service.mjs')) {
        throw 'The Playback boot task points to an unrecognized installation.'
    }
    if ($source -eq $target -or $source.StartsWith("$target\", [StringComparison]::OrdinalIgnoreCase) -or
        $target.StartsWith("$source\", [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Extract the new Playback ZIP to a separate folder, then run UPDATE-PLAYBACK.bat from that copy.'
    }

    Assert-PlaybackUpdatePath (Join-Path $source 'package.json')
    Assert-PlaybackUpdatePath (Join-Path $source 'UPDATE-MANIFEST.json')
    Assert-PlaybackUpdatePath (Join-Path $target 'package.json')
    Assert-PlaybackUpdatePath $entry
    if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) {
        throw "The boot task's Playback files are missing from $target."
    }
    $newVersion = Get-PlaybackPackageVersion $source
    $oldVersion = Get-PlaybackPackageVersion $target
    if ($newVersion -lt $oldVersion) {
        throw "Playback $oldVersion is installed. Use the latest release ZIP to update it."
    }
    $manifest = Get-Content -LiteralPath (Join-Path $source 'UPDATE-MANIFEST.json') -Raw | ConvertFrom-Json
    if ($manifest.version -ne $newVersion.ToString()) {
        throw 'The update manifest does not match the release. Extract a fresh copy of the ZIP.'
    }

    $paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($file in $manifest.files) {
        $relative = [string]$file.path
        if ($relative -notmatch '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$' -or
            $relative -match '(^|/)(data|node_modules|dist|\.git|\.env(\.[^/]+)?)(/|$)' -or
            $relative -match '(^|/)(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])([./]|$)' -or
            $relative -match '\.(/|$)' -or
            $file.sha256 -notmatch '^[a-f0-9]{64}$' -or -not $paths.Add($relative)) {
            throw "Invalid path or checksum in the update manifest: $relative"
        }
        $from = Join-Path $source $relative
        Assert-PlaybackUpdatePath $from
        Assert-PlaybackUpdatePath (Join-Path $target $relative)
        if (-not (Test-Path -LiteralPath $from -PathType Leaf) -or
            (Get-PlaybackFileHash $from) -ne $file.sha256) {
            throw "Release file is missing or damaged: $relative. Extract a fresh copy of the ZIP."
        }
    }
    foreach ($required in @('package.json', 'server.js', 'ops/boot-service.mjs', 'lib/http.js', 'public/control.html')) {
        if (-not $paths.Contains($required)) { throw "The release is missing $required." }
    }

    $wasRunning = $task.State -in @('Running', 'Queued')
    if (-not $wasRunning -and (Test-PlaybackPort $port)) {
        throw "Port $port is in use. Close the manually started Playback window before updating."
    }
    Write-Host "Updating Playback $oldVersion to $newVersion in $target..."
    $backup = Join-Path ([IO.Path]::GetTempPath()) ('fkey-playback-update-' + [guid]::NewGuid().ToString('N'))
    $backup = (New-Item -Path $backup -ItemType Directory).FullName
    $changed = [Collections.Generic.List[object]]::new()
    $disabled = $false
    $stopped = $false
    $restored = $true
    try {
        if ($task.Settings.Enabled) {
            Disable-ScheduledTask -TaskName $taskName -TaskPath $taskPath | Out-Null
            $disabled = $true
        }
        if ($wasRunning) {
            Stop-ScheduledTask -TaskName $taskName -TaskPath $taskPath
        }
        $deadline = [DateTime]::UtcNow.AddSeconds(15)
        while ((Test-PlaybackPort $port) -or (Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath).State -in @('Running', 'Queued')) {
            if ([DateTime]::UtcNow -ge $deadline) { throw "Playback did not stop on port $port." }
            Start-Sleep -Milliseconds 250
        }
        $stopped = $true

        foreach ($file in $manifest.files) {
            $relative = $file.path
            $from = Join-Path $source $relative
            $to = Join-Path $target $relative
            $old = Join-Path $backup $relative
            $existed = Test-Path -LiteralPath $to -PathType Leaf
            if ($existed) {
                # Users may set environment variables in the existing manual launchers.
                if ($relative -in @('start-player.bat', 'start-player.sh')) { continue }
                New-Item -Path (Split-Path -Parent $old) -ItemType Directory -Force | Out-Null
                Copy-Item -LiteralPath $to -Destination $old
            }
            New-Item -Path (Split-Path -Parent $to) -ItemType Directory -Force | Out-Null
            if (Test-Path -LiteralPath $to -PathType Container) { throw "A folder blocks the update: $to" }
            $changed.Add(@{ Target = $to; Backup = $old; Existed = $existed })
            Copy-Item -LiteralPath $from -Destination $to -Force
            if ((Get-PlaybackFileHash $to) -ne $file.sha256) {
                throw "Copied file failed verification: $relative"
            }
        }
    } catch {
        try {
            for ($i = $changed.Count - 1; $i -ge 0; $i--) {
                $file = $changed[$i]
                if ($file.Existed) { Copy-Item -LiteralPath $file.Backup -Destination $file.Target -Force }
                elseif (Test-Path -LiteralPath $file.Target -PathType Leaf) { Remove-Item -LiteralPath $file.Target -Force }
            }
        } catch {
            $restored = $false
            throw "The update failed and some files could not be restored. Playback was left stopped. Backup: $backup. $($_.Exception.Message)"
        }
        throw
    } finally {
        if ($restored) {
            $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
            if ((Split-Path -Parent $backup).TrimEnd('\') -eq $tempRoot -and
                (Split-Path -Leaf $backup) -match '^fkey-playback-update-[a-f0-9]{32}$') {
                Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
            }
            if ($disabled) { Enable-ScheduledTask -TaskName $taskName -TaskPath $taskPath | Out-Null }
            if ($wasRunning -and $stopped) { Start-ScheduledTask -TaskName $taskName -TaskPath $taskPath }
        }
    }

    if ($wasRunning) {
        $deadline = [DateTime]::UtcNow.AddSeconds(30)
        do {
            try {
                $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 2
                if ($health.ok -and $health.app -eq 'fKey Playback' -and $health.version -eq $newVersion.ToString()) {
                    Write-Host "Playback $newVersion is running. Refresh the dashboard."
                    return
                }
            } catch {}
            Start-Sleep -Milliseconds 500
        } while ([DateTime]::UtcNow -lt $deadline)
        throw "Playback $newVersion was installed, but did not respond on port $port. Check the boot task and data\boot-service.log."
    }
    Write-Host "Playback $newVersion was installed. The boot task was not running before the update."
}

if ($MyInvocation.InvocationName -ne '.') {
    $pauseHere = $KeepWindowOpen
    try {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = [Security.Principal.WindowsPrincipal]::new($identity)
        if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
            $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $PSCommandPath
            if ($KeepWindowOpen) { $arguments += ' -KeepWindowOpen' }
            $elevated = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -Verb RunAs -Wait -PassThru
            $pauseHere = $false
            exit $elevated.ExitCode
        }
        $mutex = [Threading.Mutex]::new($false, 'Global\fKeyPlaybackCommunityUpdate')
        try {
            try { $acquired = $mutex.WaitOne(0) }
            catch [Threading.AbandonedMutexException] { $acquired = $true }
            if (-not $acquired) { throw 'A Playback update is already running.' }
            try { Update-Playback (Join-Path $PSScriptRoot '..') }
            finally { $mutex.ReleaseMutex() }
        } finally {
            $mutex.Dispose()
        }
    } catch {
        Write-Host "Playback update: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    } finally {
        if ($pauseHere) { [void](Read-Host 'Press Enter to close this window') }
    }
}

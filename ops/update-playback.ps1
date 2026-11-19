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
        if ($item -and (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.LinkType -eq 'HardLink')) {
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

function Get-PlaybackDataRoots([string] $Target) {
    # The boot task inherits machine variables. The interactive updater may
    # have its own DATA_DIR. Preserve both, including relative configurations.
    foreach ($value in @('data', $env:DATA_DIR, [Environment]::GetEnvironmentVariable('DATA_DIR', 'Machine'))) {
        if ($value) {
            [IO.Path]::GetFullPath([IO.Path]::Combine($Target, $value)).TrimEnd('\')
        }
    }
}

function Assert-PlaybackDestination([string] $Path, [string[]] $DataRoots) {
    Assert-PlaybackUpdatePath $Path
    foreach ($dataRoot in $DataRoots) {
        if ($Path -eq $dataRoot -or $Path.StartsWith("$dataRoot\", [StringComparison]::OrdinalIgnoreCase) -or
            $dataRoot.StartsWith("$Path\", [StringComparison]::OrdinalIgnoreCase)) {
            throw "A release file overlaps the configured station data directory: $Path"
        }
    }
}

function Install-LatestPlayback([string] $Target, [string] $Node) {
    $cli = Join-Path $Target 'ops\update-station.mjs'
    Assert-PlaybackUpdatePath $cli
    Assert-PlaybackUpdatePath (Join-Path $Target 'UPDATE-MANIFEST.json')
    $version = Get-PlaybackPackageVersion $Target
    $installedManifest = Get-Content -LiteralPath (Join-Path $Target 'UPDATE-MANIFEST.json') -Raw | ConvertFrom-Json
    $cliEntry = @($installedManifest.files | Where-Object path -CEQ 'ops/update-station.mjs')
    if ($installedManifest.version -ne $version.ToString() -or $cliEntry.Count -ne 1 -or
        (Get-PlaybackFileHash $cli) -ne $cliEntry[0].sha256) {
        throw 'The installed update files do not match this release. Use UPDATE-PLAYBACK.bat from a newly extracted official ZIP.'
    }

    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
    $stage = Join-Path $tempRoot ('fkey-playback-stage-' + [guid]::NewGuid().ToString('N'))
    Assert-PlaybackUpdatePath $stage
    if (Test-Path -LiteralPath $stage) { throw 'Could not create a new update staging folder.' }
    # Elevated downloads and extracted files belong to the updating account.
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
        $owner, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow'))
    [IO.Directory]::CreateDirectory($stage, $acl) | Out-Null
    try {
        & $Node $cli --stage $stage
        if ($LASTEXITCODE -ne 0) { throw 'Could not stage the Playback release. See the download error above.' }
        $release = Join-Path $stage 'Playback'
        if (Test-Path -LiteralPath $release -PathType Container) {
            Update-Playback $release -ExpectedTarget $Target
        }
    } finally {
        if ((Split-Path -Parent $stage) -eq $tempRoot -and
            (Split-Path -Leaf $stage) -match '^fkey-playback-stage-[a-f0-9]{32}$') {
            Remove-Item -LiteralPath $stage -Recurse -Force
        }
    }
}

function Close-PlaybackInstallLock($Process) {
    try {
        $Process.StandardInput.Close()
        if (-not $Process.WaitForExit(5000)) {
            $Process.Kill()
            $Process.WaitForExit()
        }
    } finally { $Process.Dispose() }
}

function Open-PlaybackInstallLock([string] $Node, [string] $Target) {
    # Running stations and the manual updater take this same installation lock,
    # independently of their data directory or listening port.
    $cli = Join-Path $PSScriptRoot 'update-station.mjs'
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $Node
    $info.Arguments = '"{0}" --lock-install "{1}"' -f $cli, $Target
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $proc = [Diagnostics.Process]::Start($info)
    try {
        $ready = $proc.StandardOutput.ReadLineAsync()
        if (-not $ready.Wait(15000) -or $ready.Result -cne 'locked') {
            throw 'Could not lock the installation. Stop other stations or updaters using this Playback folder.'
        }
        return $proc
    } catch {
        Close-PlaybackInstallLock $proc
        throw
    }
}

function Update-Playback([string] $Source, [string] $ExpectedTarget) {
    $taskName = 'fKey Playback - Boot Server'
    $taskPath = '\'
    $task = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction SilentlyContinue
    if (-not $task) {
        throw 'For a manual station, use Settings while Playback is running, or stop it and run node ops/update-station.mjs from its installation.'
    }
    $actions = @($task.Actions)
    if ($actions.Count -ne 1 -or $actions[0].Execute -notmatch '^[A-Za-z]:[\\/]' -or
        [IO.Path]::GetFileName($actions[0].Execute) -ne 'node.exe' -or
        $actions[0].WorkingDirectory -notmatch '^[A-Za-z]:[\\/]' -or
        $actions[0].Arguments -notmatch '^"([^"]+)" --port ([0-9]{1,5})$') {
        throw 'The Playback boot task uses an unrecognized command. Its files and task were left untouched.'
    }
    $entry = $Matches[1]
    $port = [int]$Matches[2]
    $target = [IO.Path]::GetFullPath($actions[0].WorkingDirectory).TrimEnd('\')
    $source = [IO.Path]::GetFullPath($Source).TrimEnd('\')
    if ($target -notmatch '^[A-Za-z]:\\.' -or $port -lt 1 -or $port -gt 65535 -or
        $entry -notmatch '^[A-Za-z]:[\\/]' -or
        [IO.Path]::GetFullPath($entry) -ne (Join-Path $target 'ops\boot-service.mjs')) {
        throw 'The Playback boot task points to an unrecognized installation.'
    }
    $entry = Join-Path $target 'ops\boot-service.mjs'
    if ($ExpectedTarget -and $target -ne $ExpectedTarget) { throw 'The registered Playback installation changed during the download.' }
    if ((Test-Path -LiteralPath (Join-Path $source '.git')) -or (Test-Path -LiteralPath (Join-Path $target '.git'))) {
        throw 'Update a source checkout using Git. Release updates require an extracted installation.'
    }

    Assert-PlaybackUpdatePath (Join-Path $source 'package.json')
    Assert-PlaybackUpdatePath (Join-Path $source 'UPDATE-MANIFEST.json')
    Assert-PlaybackUpdatePath (Join-Path $target 'package.json')
    $dataRoots = @(Get-PlaybackDataRoots $target)
    Assert-PlaybackDestination (Join-Path $target 'UPDATE-MANIFEST.json') $dataRoots
    Assert-PlaybackUpdatePath $entry
    if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) {
        throw "The boot task's Playback files are missing from $target."
    }
    if ($source -eq $target) {
        Install-LatestPlayback $target $actions[0].Execute
        return
    }
    if ($source.StartsWith("$target\", [StringComparison]::OrdinalIgnoreCase) -or
        $target.StartsWith("$source\", [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Extract the Playback ZIP to a separate folder outside the existing installation.'
    }
    $newVersion = Get-PlaybackPackageVersion $source
    $oldVersion = Get-PlaybackPackageVersion $target
    if ($newVersion -lt $oldVersion) {
        throw "Playback $oldVersion is installed. Use the latest release ZIP to update it."
    }
    $manifestPath = Join-Path $source 'UPDATE-MANIFEST.json'
    $manifestBytes = [IO.File]::ReadAllBytes($manifestPath)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $manifestDigest = [BitConverter]::ToString($sha.ComputeHash($manifestBytes)).Replace('-', '') }
    finally { $sha.Dispose() }
    $manifestFile = @{ path = 'UPDATE-MANIFEST.json'; sha256 = $manifestDigest }
    $manifest = [Text.Encoding]::UTF8.GetString($manifestBytes).TrimStart([char]0xFEFF) | ConvertFrom-Json
    if ($manifest.version -ne $newVersion.ToString()) {
        throw 'The update manifest does not match the release. Extract a fresh copy of the ZIP.'
    }

    $paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($file in $manifest.files) {
        $relative = [string]$file.path
        if ($relative -notmatch '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$' -or $relative -eq 'UPDATE-MANIFEST.json' -or
            $relative -match '(^|/)(data|node_modules|dist|\.git|\.env(\.[^/]+)?|\.playback-update[^/]*|\.playback-install\.sqlite3[^/]*)(/|$)' -or
            $relative -match '(^|/)(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])([./]|$)' -or
            $relative -match '\.(/|$)' -or
            $file.sha256 -notmatch '^[a-f0-9]{64}$' -or -not $paths.Add($relative)) {
            throw "Invalid path or checksum in the update manifest: $relative"
        }
        $from = Join-Path $source $relative
        Assert-PlaybackUpdatePath $from
        Assert-PlaybackDestination (Join-Path $target $relative) $dataRoots
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
    $backup = Join-Path $target '.playback-update-transaction'
    Assert-PlaybackDestination $backup $dataRoots
    Assert-PlaybackDestination (Join-Path $target '.playback-install.sqlite3') $dataRoots
    $ownsBackup = $false
    $lock = $null
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
        $lock = Open-PlaybackInstallLock $actions[0].Execute $target
        if ((Get-PlaybackPackageVersion $target) -ne $oldVersion) { throw 'The installed version changed during the update. Try again.' }
        if (Test-Path -LiteralPath $backup) { throw "An interrupted update requires recovery. Inspect $backup before updating." }
        New-Item -Path $backup -ItemType Directory | Out-Null
        $ownsBackup = $true
        foreach ($file in (@($manifest.files) + $manifestFile)) {
            if ($lock.HasExited) { throw 'The installation lock was lost during the update.' }
            $relative = $file.path
            $from = Join-Path $source $relative
            $to = Join-Path $target $relative
            Assert-PlaybackDestination $to $dataRoots
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
        try {
            if ($restored -and $ownsBackup) {
                $resolved = (Resolve-Path -LiteralPath $backup).ProviderPath
                if ((Split-Path -Parent $resolved) -ne $target -or (Split-Path -Leaf $resolved) -ne '.playback-update-transaction') {
                    throw 'Unexpected update backup folder.'
                }
                Assert-PlaybackUpdatePath $resolved
                Remove-Item -LiteralPath $resolved -Recurse -Force
            }
        } finally {
            if ($lock) { Close-PlaybackInstallLock $lock }
        }
        if ($restored) {
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

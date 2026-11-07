# Install only this plugin. Run with OBS closed; administrator rights may be required.
param([string]$ObsPath = 'C:/Program Files/obs-studio')
$ErrorActionPreference = 'Stop'
try {
if (Get-Process obs64 -ErrorAction SilentlyContinue) { Wait-Process -Name obs64 -Timeout 15 -ErrorAction SilentlyContinue }
if (Get-Process obs64 -ErrorAction SilentlyContinue) { throw 'Close OBS before installing the Playback plugin.' }
$version = (Get-Item -LiteralPath (Join-Path $ObsPath 'bin/64bit/obs64.exe')).VersionInfo
$is33 = $version.FileMajorPart -eq 33
if (!(($version.FileMajorPart -eq 32 -and $version.FileMinorPart -eq 2 -and $version.FileBuildPart -eq 2) -or ($is33 -and $version.FileMinorPart -eq 0 -and $version.FileBuildPart -in @(0, 1)))) {throw 'This build supports OBS 32.2.2, 33.0.0 or 33.0.1.'}
$packageFolder = if ($is33) {'package-obs33'} else {'package'}
$source = Join-Path $PSScriptRoot "$packageFolder/obs-plugins/64bit/fplayback-youtube.dll"
$browserFolder = if ($is33) {'core/obs-browser'} else {'obs-plugins/64bit'}
$cef = (Get-Item -LiteralPath (Join-Path $ObsPath "$browserFolder/libcef.dll")).VersionInfo
if (!(($is33 -and $cef.FileMajorPart -eq 150 -and $cef.FileMinorPart -eq 0 -and $cef.FileBuildPart -eq 20) -or (!$is33 -and $cef.FileMajorPart -eq 127 -and $cef.FileMinorPart -eq 145 -and $cef.FileBuildPart -eq 7))) {throw 'The selected OBS Chromium runtime does not match this plugin build.'}
$target = Join-Path $ObsPath 'obs-plugins/64bit/fplayback-youtube.dll'
New-Item -ItemType Directory -Force (Split-Path -Parent $target) | Out-Null
if (!(Test-Path -LiteralPath $source)) { throw 'Build the plugin before installing.' }
if (!(Test-Path -LiteralPath (Split-Path -Parent $target))) { throw 'OBS installation not found.' }
if (Test-Path -LiteralPath $target) {
  $backup = Join-Path $PSScriptRoot ('package/fplayback-youtube-before-install-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.dll')
  Copy-Item -LiteralPath $target -Destination $backup
}
Copy-Item -LiteralPath $source -Destination $target -Force
if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $target).Hash) { throw 'Installed checksum mismatch.' }
Write-Output 'Playback OBS plugin installed and checksum verified.'
} catch {
  $_.Exception.Message | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'package/install-error.txt')
  exit 1
}

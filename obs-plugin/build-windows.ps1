param([string]$ObsPath = 'C:\Program Files\obs-studio', [ValidateSet('32','33')][string]$ObsMajor = '32')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = $PSScriptRoot
$packageVersion = '0.1.13'
$deps = Join-Path $root '.deps'
$is33 = $ObsMajor -eq '33'
$build = Join-Path $root $(if ($is33) {'build-obs33'} else {'build'})
$package = Join-Path $root $(if ($is33) {'package-obs33'} else {'package'})
$variant = if ($is33) {'-OBS33'} else {''}
$cefRoot = Join-Path $deps $(if ($is33) {'cef33'} else {'cef-sdk'})
$obsHeaders = Join-Path $deps $(if ($is33) {'obs33-source/obs-studio-33.0.0'} else {'obs/obs-studio-32.2.2'})
$browserRuntime = if ($is33) {Join-Path $ObsPath 'core/obs-browser'} else {Join-Path $ObsPath 'obs-plugins/64bit'}
if (!(Test-Path -LiteralPath (Join-Path $browserRuntime 'libcef.dll'))) {throw 'The selected OBS browser runtime was not found.'}
$obsVersion = (Get-Item -LiteralPath (Join-Path $ObsPath 'bin/64bit/obs64.exe')).VersionInfo
$supportedObs = if ($is33) {'33.0.0', '33.0.1'} else {'32.2.2'}
$actualObs = "$($obsVersion.FileMajorPart).$($obsVersion.FileMinorPart).$($obsVersion.FileBuildPart)"
if ($actualObs -notin $supportedObs) {throw "The selected runtime must be OBS $($supportedObs -join ' or '). Choose the matching -ObsMajor and -ObsPath before building."}
$cefVersion = (Get-Item -LiteralPath (Join-Path $browserRuntime 'libcef.dll')).VersionInfo
$expectedCef = if ($is33) {'150.0.20'} else {'127.145.7'}
if (("$($cefVersion.FileMajorPart).$($cefVersion.FileMinorPart).$($cefVersion.FileBuildPart)") -ne $expectedCef) {throw "The selected OBS runtime must contain CEF $expectedCef."}
New-Item -ItemType Directory -Force $deps | Out-Null
$sourceArchive = Join-Path $deps $(if ($is33) {'installer-source-obs33.zip'} else {'installer-source.zip'})
Compress-Archive -LiteralPath "$root/src", "$root/vendor", "$root/CMakeLists.txt", "$root/build-windows.ps1", "$root/install-local.ps1", "$root/resources.qrc", "$root/watch-controller.js", "$root/README.md", "$root/LICENSE" -DestinationPath $sourceArchive -Force
function Fetch-Verified($Url, $Name, $Hash) {
  $file = Join-Path $deps $Name
  if (!(Test-Path -LiteralPath $file)) { Invoke-WebRequest $Url -OutFile $file }
  if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $Hash) { throw "Checksum mismatch: $Name" }
  return $file
}
if ($is33) {
  $cefArchive = Fetch-Verified 'https://cdn-fastly.obsproject.com/downloads/cef_binary_7871_windows_x64.zip' 'cef33.zip' '54CD191A3F56BB1F05BE22B95E1FA8041061B38BD5FE94E0776FB34DD599F341'
} else {
  $cefArchive = Fetch-Verified 'https://cdn-fastly.obsproject.com/downloads/cef_binary_6533_windows_x64_v2.zip' 'cef_binary_6533_windows_x64_v2.zip' '922EFBDA1F2F8BE9E5B2754D878A14D90AFC81F04E94FC9101A7513E2B5CECC1'
}
if (!(Test-Path "$cefRoot/include/cef_version.h")) { Expand-Archive -LiteralPath $cefArchive -DestinationPath $cefRoot -Force }
Copy-Item -LiteralPath "$cefRoot/LICENSE.txt" -Destination "$root/vendor/CEF-LICENSE.txt" -Force
$qt = Fetch-Verified 'https://github.com/obsproject/obs-deps/releases/download/2026-08-26/windows-deps-qt6-2026-08-26-x64-RelWithDebInfo.zip' 'qt.zip' '590B8122154E5FDA214A4B7EFD0EA50C69036DDCF6511F0A4AC11AE851DE1A23'
if ($is33) {
  $obs = Fetch-Verified 'https://github.com/obsproject/obs-studio/archive/refs/tags/33.0.0.zip' 'obs33-source.zip' 'BDAB14146289F39BE6C12D5165812BA5B37B5231F857CB84AA5E4BAFEAAA8686'
} else {
  $obs = Fetch-Verified 'https://github.com/obsproject/obs-studio/archive/refs/tags/32.2.2.zip' 'obs.zip' 'F15F001F1FA526405318835F44F9910046502F496EBC3A30D5296A5018B831AA'
}
if ((Get-FileHash -LiteralPath "$root/vendor/browser-panel.hpp" -Algorithm SHA256).Hash -ne '519895569D7567B8677804F4031D96FF99FEE5D1164600C48DABE15F13C4A253') { throw 'Browser panel header checksum mismatch' }
if (!(Test-Path "$deps/qt/lib/Qt6Core.lib")) { Expand-Archive -LiteralPath $qt -DestinationPath "$deps/qt" -Force }
if (!(Test-Path "$obsHeaders/libobs/obs.h")) { Expand-Archive -LiteralPath $obs -DestinationPath $(if ($is33) {"$deps/obs33-source"} else {"$deps/obs"}) -Force }
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vs) { throw 'Install Visual Studio with the Desktop development with C++ workload.' }
$toolset = Get-ChildItem -LiteralPath "$vs/VC/Tools/MSVC" -Directory | Sort-Object Name -Descending | Select-Object -First 1
$tools = Join-Path $toolset.FullName 'bin/Hostx64/x64'
$imports = Join-Path $deps $(if ($is33) {'imports-obs33'} else {'imports'})
New-Item -ItemType Directory -Force $imports | Out-Null
foreach ($name in @('obs', 'obs-frontend-api', 'libobs-winrt')) {
  $dll = Join-Path $ObsPath "bin/64bit/$name.dll"
  if (!(Test-Path -LiteralPath $dll)) { throw "Missing OBS runtime: $dll" }
  $exports = & "$tools/dumpbin.exe" /nologo /exports $dll
  if ($LASTEXITCODE) { throw 'dumpbin failed' }
  $symbols = @($exports | ForEach-Object { if ($_ -match '^\s+\d+\s+[0-9A-F]+\s+[0-9A-F]+\s+(\S+)') { $Matches[1] } })
  if ($symbols.Count -lt 10) { throw "Missing exports in $name" }
  @("LIBRARY $name.dll", 'EXPORTS') + $symbols | Set-Content -LiteralPath "$imports/$name.def" -Encoding ascii
  & "$tools/lib.exe" /nologo /machine:x64 "/def:$imports/$name.def" "/out:$imports/$name.lib"
  if ($LASTEXITCODE) { throw 'Import library generation failed' }
}
@('#pragma once', '#define OBS_RELEASE_CANDIDATE 0', '#define OBS_BETA 0') | Set-Content -LiteralPath "$imports/obsconfig.h" -Encoding ascii
& cmake -S $root -B "$build" -G 'Visual Studio 18 2026' -A x64 "-DCMAKE_PREFIX_PATH=$deps/qt" "-DCEF_ROOT=$cefRoot" "-DPLAYBACK_OBS33=$is33" "-DOBS_BROWSER_RUNTIME=$browserRuntime" "-DOBS_HEADERS=$obsHeaders" "-DOBS_BROWSER_HEADERS=$root/vendor" "-DOBS_IMPORT_LIBS=$imports" "-DOBS_RUNTIME_PATH=$ObsPath/bin/64bit" "-DINSTALLER_SOURCE_ZIP=$($sourceArchive.Replace([char]92,[char]47))"
if ($LASTEXITCODE) { throw 'CMake configuration failed' }
& cmake --build "$build" --config RelWithDebInfo --parallel
if ($LASTEXITCODE) { throw 'Plugin compilation failed' }
& ctest --test-dir "$build" -C RelWithDebInfo --output-on-failure
if ($LASTEXITCODE) { throw 'Native plugin tests failed' }
& cmake --install "$build" --config RelWithDebInfo --prefix "$package"
if ($LASTEXITCODE) { throw 'Plugin packaging failed' }
Copy-Item -LiteralPath "$root/README.md", "$root/LICENSE" -Destination "$package"
$sourcePath = Join-Path $root $(if ($is33) {'package-obs33/source'} else {'package/source'})
New-Item -ItemType Directory -Force $sourcePath | Out-Null
foreach ($name in @('src', 'vendor', 'CMakeLists.txt', 'build-windows.ps1', 'install-local.ps1', 'resources.qrc', 'watch-controller.js', 'README.md', 'LICENSE')) {
  Copy-Item -LiteralPath (Join-Path $root $name) -Destination $sourcePath -Recurse -Force
}
$installerName = "fKey-Playback-OBS-Plugin-Setup-$packageVersion$variant.exe"
$installer = Join-Path $root $installerName
Copy-Item -LiteralPath "$package/$installerName" -Destination $installer -Force
((Get-FileHash -LiteralPath $installer).Hash.ToLowerInvariant()+'  '+(Split-Path -Leaf $installer)) | Set-Content -LiteralPath ($installer+'.sha256') -Encoding ascii
$archiveName = "fplayback-youtube-$packageVersion$variant-windows-x64.zip"
$archivePath = Join-Path $root $archiveName
Compress-Archive -LiteralPath "$package/obs-plugins", "$package/source", "$package/README.md", "$package/LICENSE", $installer -DestinationPath $archivePath -Force
((Get-FileHash -LiteralPath $archivePath).Hash.ToLowerInvariant()+"  "+$archiveName) | Set-Content -LiteralPath ($archivePath+'.sha256') -Encoding ascii
Get-FileHash -LiteralPath $archivePath -Algorithm SHA256 | Format-List
Write-Output "Built plugin: $package/obs-plugins/64bit/fplayback-youtube.dll"

#Requires -Version 5.1
# Open only the operator dashboard after the boot service becomes healthy.
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)] [int] $Port = 4177,
    [string] $ObsPath = ''
)
$ErrorActionPreference = 'Stop'
$healthUrl = "http://127.0.0.1:$Port/api/health"
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2
        if ($health.ok -eq $true -and $health.app -eq 'fKey Playback') {
            $ready = $true
            break
        }
    } catch {
        # The network stack / Playback may still be starting after sign-in.
    }
    Start-Sleep -Seconds 2
}
if (-not $ready) { exit 1 }
Start-Process -FilePath "http://127.0.0.1:$Port/control"
if ($ObsPath) {
    if (-not (Test-Path -LiteralPath $ObsPath -PathType Leaf)) { throw 'Configured OBS executable is missing.' }
    $processName = [IO.Path]::GetFileNameWithoutExtension($ObsPath)
    if (-not (Get-Process -Name $processName -ErrorAction SilentlyContinue)) {
        Start-Process -FilePath $ObsPath -WorkingDirectory (Split-Path -Parent $ObsPath) -WindowStyle Normal
    }
}
exit 0

@echo off
setlocal EnableExtensions
if not exist "%~dp0ops\update-playback.ps1" (
    echo Extract the complete Playback ZIP before running the updater.
    pause
    exit /b 1
)
echo Updating the existing Playback installation. Its video output may pause briefly.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ops\update-playback.ps1" -KeepWindowOpen
exit /b %ERRORLEVEL%

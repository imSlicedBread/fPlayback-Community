@echo off
setlocal EnableExtensions
if not exist "%~dp0ops\update-playback.ps1" (
    echo Extract the complete Playback ZIP before running the updater.
    pause
    exit /b 1
)
echo Updating Playback. A running station will restart if the update is installed.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ops\update-playback.ps1" -KeepWindowOpen
exit /b %ERRORLEVEL%

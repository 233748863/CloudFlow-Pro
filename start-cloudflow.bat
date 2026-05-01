@echo off
setlocal

cd /d "%~dp0"
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-cloudflow.ps1" %*

exit /b %ERRORLEVEL%

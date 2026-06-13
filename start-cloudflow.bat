@echo off
setlocal

cd /d "%~dp0"

if not "%~1"=="" goto run_with_args

echo.
echo CloudFlow Pro startup
echo 1. All
echo 2. Backend only
echo 3. React frontend only
echo 4. Tauri desktop only
echo 5. Backend + React frontend
echo 6. Backend + Tauri desktop
echo 7. React frontend + Tauri desktop
echo 0. Exit
echo.
choice /c 12345670 /n /m "Select option: "
set "menu_choice=%ERRORLEVEL%"

if "%menu_choice%"=="1" set "START_ARGS=-All"
if "%menu_choice%"=="2" set "START_ARGS=-Backend"
if "%menu_choice%"=="3" set "START_ARGS=-React"
if "%menu_choice%"=="4" set "START_ARGS=-Tauri"
if "%menu_choice%"=="5" set "START_ARGS=-Backend -React"
if "%menu_choice%"=="6" set "START_ARGS=-Backend -Tauri"
if "%menu_choice%"=="7" set "START_ARGS=-React -Tauri"
if "%menu_choice%"=="8" exit /b 0

pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-cloudflow.ps1" %START_ARGS%
exit /b %ERRORLEVEL%

:run_with_args
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-cloudflow.ps1" %*

exit /b %ERRORLEVEL%

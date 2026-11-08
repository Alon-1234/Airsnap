@echo off
rem ============================================================
rem  AirSnap in Docker - double-click to start everything
rem    App in the browser:  http://localhost:8081
rem    Live drone viewer:   http://localhost:4000
rem  Needs Docker Desktop: https://www.docker.com/products/docker-desktop/
rem ============================================================
title AirSnap (Docker)
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 goto :nodocker
docker info >nul 2>nul
if errorlevel 1 goto :notrunning

if exist ".env" goto :build
echo.
echo   First-time setup
echo   ----------------
echo   Type the email you will sign in to AirSnap with.
echo   On YOUR copy that account becomes admin, so you can place
echo   drone hives near you and order for free.
echo.
set "ADMIN_EMAIL="
set /p "ADMIN_EMAIL=  Your email: "
if "%ADMIN_EMAIL%"=="" set "ADMIN_EMAIL=akonk13579@gmail.com"
> ".env" echo ADMIN_EMAILS=%ADMIN_EMAIL%
echo   Saved in the .env file. Edit it any time, then run this again.

:build
echo.
echo   Building and starting AirSnap... the first time takes 5-10 minutes.
echo.
docker compose up --build -d
if errorlevel 1 goto :failed

echo.
echo   Waiting for the app to start...
powershell -NoProfile -Command "for($i=0;$i -lt 90;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:8081/health;if($r.StatusCode -eq 200){exit 0}}catch{};Start-Sleep 2};exit 1"
if errorlevel 1 goto :failed

start "" "http://localhost:8081"
start "" "http://localhost:4000"
echo.
echo   ============================================================
echo    AirSnap is running in Docker
echo      App in your browser:  http://localhost:8081
echo      Live drone viewer:    http://localhost:4000
echo    To stop it, double-click "Stop AirSnap (Docker).bat"
echo   ============================================================
echo.
pause
exit /b 0

:nodocker
echo.
echo   Docker is not installed.
echo   Install Docker Desktop from https://www.docker.com/products/docker-desktop/
echo   open it, then double-click this file again.
echo.
pause
exit /b 1

:notrunning
echo.
echo   Docker Desktop is installed but not running.
echo   Open "Docker Desktop" from the Start menu, wait until it says
echo   "Engine running", then double-click this file again.
echo.
pause
exit /b 1

:failed
echo.
echo   Something went wrong - the messages above say what.
echo   To see the logs, run:  docker compose logs
echo.
pause
exit /b 1

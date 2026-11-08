@echo off
rem Stop AirSnap in Docker. Your data (users, credits, hives) is kept.
title AirSnap (Docker) - stop
cd /d "%~dp0"
docker compose down
echo.
echo   AirSnap stopped. Your data is kept for next time.
echo.
pause

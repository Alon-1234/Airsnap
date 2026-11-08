@echo off
rem ============================================================
rem  AirSnap - double-click to start everything
rem    - the app in your browser + on your phone (Expo Go QR code)
rem    - the live drone viewer website
rem    - uses the always-on cloud server
rem  Close this window (or press Ctrl+C) to stop.
rem ============================================================
title AirSnap
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo   Download the LTS version from https://nodejs.org , install it,
  echo   then double-click this file again.
  echo.
  pause
  exit /b 1
)

node scripts\start-all.js %*
if errorlevel 1 pause

@echo off
rem ============================================================
rem  AirSnap - start everything with the server on THIS laptop
rem  (instead of the cloud server). Put your Firebase service
rem  account in airsnap-server\.env for credits / orders to work
rem  (see SETUP.md section 4).
rem ============================================================
title AirSnap (local server)
cd /d "%~dp0"
call "%~dp0Start AirSnap.bat" local %*

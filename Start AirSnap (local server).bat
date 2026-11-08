@echo off
rem ============================================================
rem  AirSnap - start everything with the server on THIS laptop
rem  (instead of the cloud server), using a local database.
rem  To use real Firestore instead, put FIREBASE_SERVICE_ACCOUNT
rem  in airsnap-server\.env (see SETUP.md section 4).
rem ============================================================
title AirSnap (local server)
cd /d "%~dp0"
call "%~dp0Start AirSnap.bat" local %*

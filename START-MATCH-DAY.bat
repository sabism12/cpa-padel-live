@echo off
REM ============================================================================
REM  CPA Padel - Match Day Launcher
REM  Double-click this file to start the tournament scoring gateway.
REM
REM  Runs 5 steps, then starts the gateway:
REM    1. Keep the laptop awake
REM    2. Report hotspot status
REM    3. Block phones from using the Dell as an Internet gateway
REM    4. Ensure the firewall allows phones to reach port 3000
REM    5. Start the scoring gateway
REM
REM  Keep the window OPEN for the whole tournament.
REM ============================================================================

setlocal
title CPA Padel - Match Day

REM --- Re-launch as Administrator if needed ---------------------------------
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo.
  echo  Administrator rights are required.
  echo  A Windows prompt will appear - click YES.
  echo.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"

echo ============================================================
echo   CPA PADEL - MATCH DAY LAUNCHER
echo ============================================================
echo.

REM --- Step 1: power settings ----------------------------------------------
echo [1/5] Keeping the laptop awake...
powercfg /change standby-timeout-ac 0    >nul 2>&1
powercfg /change hibernate-timeout-ac 0  >nul 2>&1
powercfg /change monitor-timeout-ac 20   >nul 2>&1
echo        Done.
echo.

REM --- Step 2: hotspot status ----------------------------------------------
echo [2/5] Checking Windows Mobile Hotspot...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-hotspot.ps1"
echo.

REM --- Step 3: block phone Internet ----------------------------------------
echo [3/5] Setting phone Internet block...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\set-forwarding.ps1"
echo.

REM --- Step 4: firewall allow ----------------------------------------------
echo [4/5] Checking firewall rule for port 3000...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-firewall.ps1"
echo.

REM --- Step 5: start the gateway -------------------------------------------
echo [5/5] Starting the scoring gateway...
echo.

if not exist "gateway-secrets.bat" (
  echo ============================================================
  echo   SETUP REQUIRED - missing gateway-secrets.bat
  echo ============================================================
  echo.
  echo   Create gateway-secrets.bat in this folder with your
  echo   secret values. See MATCH-DAY.md for the format.
  echo.
  pause
  exit /b 1
)

call gateway-secrets.bat

set GATEWAY_MODE=on
set NODE_ENV=production
set PORT=3000
set BIND_HOST=0.0.0.0
set DATA_DIR=./data
set GATEWAY_NAME=Dell Gateway
set UPSTREAM_URL=https://cpa-padel-tournament.onrender.com

echo.
echo ============================================================
echo   READY - KEEP THIS WINDOW OPEN FOR THE WHOLE TOURNAMENT
echo ============================================================
echo.

call npm start

echo.
echo Gateway stopped. You may close this window.
pause

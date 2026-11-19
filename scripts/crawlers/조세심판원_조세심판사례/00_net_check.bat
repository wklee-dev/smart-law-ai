@echo off
REM ==========================================================================
REM  00. NETWORK CHECK - diagnose DNS / HTTPS access to the source site
REM      Run this if a collection shows: getaddrinfo failed / Failed to resolve
REM      This batch does not change the database.
REM ==========================================================================
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] python was not found in PATH. Install Python and retry.
  pause
  exit /b 1
)

echo.
echo [00] network check ...
echo.
python run_crawl.py net-check
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (echo [OK] network check passed.) else (echo [ERROR] network check failed. See the checklist above.)
echo.
pause
endlocal
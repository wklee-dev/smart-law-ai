@echo off
REM ==========================================================================
REM  05. DETAIL TEST - collect 10 decision details (metadata + full body)
REM      Requires list data first (run 03 or 04).
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
echo [05] detail test : collecting 10 details ...
echo.
python run_crawl.py detail --limit 10
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (echo [OK] detail test finished.) else (echo [ERROR] exit code = %RC%)
echo.
pause
endlocal
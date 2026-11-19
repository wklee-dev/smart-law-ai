@echo off
REM ==========================================================================
REM  09. STATS - show current collection status (read-only)
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
echo [09] stats ...
echo.
python run_crawl.py stats
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (echo [OK] stats finished.) else (echo [ERROR] exit code = %RC%)
echo.
pause
endlocal
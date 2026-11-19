@echo off
REM ==========================================================================
REM  08. RESUME - collect only rows whose detail collection is still pending
REM      Use after Ctrl+C, a network failure, or a PC restart.
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
echo [08] resume : collecting pending details ...
echo.
python run_crawl.py resume
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (echo [OK] resume finished.) else (echo [ERROR] exit code = %RC%. Run 00_net_check.bat if this was a network error.)
echo.
pause
endlocal
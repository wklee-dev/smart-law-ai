@echo off
REM ==========================================================================
REM  07. FULL ALL - collect the entire Customs category (list + detail)
REM      Expected list size: 414 pages / 4,140 rows.
REM      Expected duration: several hours.
REM      Run 01_init_db.bat first. Safe to stop; use 08_resume.bat afterward.
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
echo [07] full all : collecting list + detail. This will take a while ...
echo.
python run_crawl.py full
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (echo [OK] full collection finished.) else (echo [ERROR] exit code = %RC%. Run 00_net_check.bat if this was a network error.)
echo.
pause
endlocal
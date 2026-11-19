@echo off
REM ==========================================================================
REM  01. INIT DB - create new tables (tb_tt_*) in the target database
REM      Target DB : D:\SQLiteDB\smart_law_ai.db   (existing tables untouched)
REM      A backup is created automatically before the tables are added.
REM      Run this ONCE before any collection.
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
echo [01] init-db : creating new tables ...
echo.
python run_crawl.py init-db
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (echo [OK] init-db finished.) else (echo [ERROR] exit code = %RC%)
echo.
pause
endlocal
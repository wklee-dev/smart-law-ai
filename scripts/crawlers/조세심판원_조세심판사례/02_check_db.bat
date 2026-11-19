@echo off
REM ==========================================================================
REM  02. CHECK DB - list existing tables vs new tables, and show status
REM      Read-only: it never modifies data.
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
echo [02] check-db : listing tables and collection status ...
echo.
python run_crawl.py check-db
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (echo [OK] check-db finished.) else (echo [ERROR] exit code = %RC%)
echo.
pause
endlocal
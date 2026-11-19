@echo off
REM ==========================================================================
REM  03. LIST TEST - collect only 1 list page (10 rows)
REM      Use this first to verify the connection and the parser.
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
echo [03] list test : collecting 1 page (10 rows) ...
echo.
python run_crawl.py list --max-pages 1
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (echo [OK] list test finished.) else (echo [ERROR] exit code = %RC%)
echo.
pause
endlocal
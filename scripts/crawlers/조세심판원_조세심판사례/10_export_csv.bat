@echo off
REM ==========================================================================
REM  10. EXPORT CSV - write all collected master rows to .\export\*.csv
REM      CSV encoding: UTF-8 with BOM (Excel compatible)
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
echo [10] export CSV ...
echo.
python run_crawl.py export --out ".\export"
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (echo [OK] export finished.) else (echo [ERROR] exit code = %RC%)
echo.
pause
endlocal
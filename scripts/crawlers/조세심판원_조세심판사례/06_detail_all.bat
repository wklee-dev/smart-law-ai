@echo off
REM ==========================================================================
REM  06. DETAIL ALL - collect all pending details (metadata + body text)
REM      Requires list data first (run 04_list_all.bat).
REM      Expected duration: several hours, based on network speed and delay_sec.
REM      Safe to stop: run 08_resume.bat to continue later.
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
echo [06] detail all : collecting all pending details ...
echo.
python run_crawl.py detail
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (echo [OK] detail collection finished.) else (echo [ERROR] exit code = %RC%. Run 08_resume.bat after fixing the cause.)
echo.
pause
endlocal
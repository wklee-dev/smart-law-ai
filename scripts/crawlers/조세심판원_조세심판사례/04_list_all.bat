@echo off
REM ==========================================================================
REM  04. LIST ALL - collect every list page of the target category (Customs)
REM      Expected : 414 pages / 4,140 rows  (about 10 minutes)
REM      Results go to tb_tt_case_list.
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
echo [04] list all : collecting the full list (this takes a while) ...
echo.
python run_crawl.py list
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (echo [OK] list collection finished.) else (echo [ERROR] exit code = %RC%)
echo.
pause
endlocal
@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 run.py crawl %*
) else (
  python run.py crawl %*
)
set "result=%errorlevel%"
if not "%result%"=="0" echo Crawl failed. Check the log for details.
exit /b %result%

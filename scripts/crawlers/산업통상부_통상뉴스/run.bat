@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
where py >nul 2>&1
if %errorlevel%==0 (
    py -3 -X utf8 fta_crawler.py %*
) else (
    python -X utf8 fta_crawler.py %*
)
set "exitcode=%errorlevel%"
if not "%exitcode%"=="0" echo Crawler failed. See the log file for details.
pause
exit /b %exitcode%

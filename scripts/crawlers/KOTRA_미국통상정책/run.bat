@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
python run.py %*
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" echo Crawl failed. Exit code: %EXITCODE%
exit /b %EXITCODE%

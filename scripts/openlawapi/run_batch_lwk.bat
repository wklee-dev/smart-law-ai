@echo off
setlocal
cd /d "%~dp0"

set PYTHON=python
if not "%PYTHON_PATH%"=="" set PYTHON=%PYTHON_PATH%
 
%PYTHON% batch_openlaw_crawl.py --all --skip-collected -y
set EXITCODE=%ERRORLEVEL%
echo.

echo ================================================
echo  Shutdown in 60 seconds.
echo ================================================
shutdown /s /t 60

exit /b %EXITCODE%

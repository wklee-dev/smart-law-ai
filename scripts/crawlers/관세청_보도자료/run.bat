@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
    py -3 "%~dp0customs_crawler.py" %*
) else (
    python "%~dp0customs_crawler.py" %*
)
set "RESULT=%ERRORLEVEL%"
if "%~1"=="" pause
exit /b %RESULT%

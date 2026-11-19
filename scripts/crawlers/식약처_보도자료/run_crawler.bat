@echo off
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
chcp 65001 >nul 2>&1
where py >nul 2>&1
if not errorlevel 1 (
    py -3 "%~dp0mfds_crawler.py" %*
) else (
    where python >nul 2>&1
    if errorlevel 1 (
        echo Python 3 was not found. Install Python 3 and enable Add Python to PATH.
        set "RESULT=1"
        goto done
    )
    python "%~dp0mfds_crawler.py" %*
)
set "RESULT=%ERRORLEVEL%"
:done
echo.
echo Exit code: %RESULT%
if "%~1"=="" pause
exit /b %RESULT%

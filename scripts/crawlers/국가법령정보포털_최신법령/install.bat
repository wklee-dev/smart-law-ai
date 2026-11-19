@echo off
setlocal
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set "PY=py -3"
py -3 --version >nul 2>&1
if errorlevel 1 (
    set "PY=python"
    python --version >nul 2>&1
    if errorlevel 1 (
        echo Python 3.10 or newer is required. Install Python and enable Add to PATH.
        pause
        exit /b 1
    )
)
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)"
if errorlevel 1 (
    echo Python 3.10 or newer is required.
    pause
    exit /b 1
)
%PY% -m pip install --user -r requirements.txt
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" echo Dependency installation failed. Read the error above.
if "%RESULT%"=="0" echo Installation complete. Run run.bat, or use a target-specific crawl BAT.
pause
exit /b %RESULT%

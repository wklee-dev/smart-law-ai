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
if "%~1"=="" (
    echo Usage: collect_selected.bat item_key[,item_key] [extra options]
    echo Copy item keys from output\selected_list.csv.
    pause
    exit /b 1
)
%PY% -u crawler.py collect --law-policy include --ids %*
set "RESULT=%ERRORLEVEL%"
echo Exit code: %RESULT%
pause
exit /b %RESULT%

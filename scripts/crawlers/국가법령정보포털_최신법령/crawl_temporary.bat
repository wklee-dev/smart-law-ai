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
        if not defined LAWCRAWLER_NO_PAUSE pause
        exit /b 1
    )
)
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)"
if errorlevel 1 (
    echo Python 3.10 or newer is required.
    if not defined LAWCRAWLER_NO_PAUSE pause
    exit /b 1
)
echo Target: temporary - K-column OR search and all matching details/files.
echo All search pages. End-page options are ignored for this target.
%PY% -u crawler.py all --categories temporary %*
set "RESULT=%ERRORLEVEL%"
echo Exit code: %RESULT%
echo 0=complete, 1=error, 2=partial, no results, or source file format warning.
if not defined LAWCRAWLER_NO_PAUSE pause
exit /b %RESULT%

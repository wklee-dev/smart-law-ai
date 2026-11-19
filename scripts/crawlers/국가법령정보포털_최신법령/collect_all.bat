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
echo K-column OR search, requested page range, text and all attachments.
echo Normal targets: pages 1-70 by default; change with --end-page N.
echo Temporary laws, temporary articles and unconstitutional articles: always all pages.
%PY% -u crawler.py all %*
set "RESULT=%ERRORLEVEL%"
echo Exit code: %RESULT%
echo 0=complete, 1=error, 2=partial, no results, or source file format warning.
pause
exit /b %RESULT%

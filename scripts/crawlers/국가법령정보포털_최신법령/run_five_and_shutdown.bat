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
        echo ERROR: Python 3.10 or newer is required. Shutdown will NOT be scheduled.
        pause
        exit /b 1
    )
)
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)"
if errorlevel 1 (
    echo ERROR: Python 3.10 or newer is required. Shutdown will NOT be scheduled.
    pause
    exit /b 1
)
for %%F in (crawler.py config.json crawl_scheduled.bat crawl_repealed.bat crawl_temporary.bat crawl_temporary_articles.bat crawl_unconstitutional.bat) do (
    if not exist "%~dp0%%F" (
        echo ERROR: Missing %%F. Copy these BAT files into the crawler folder.
        echo Shutdown will NOT be scheduled.
        pause
        exit /b 1
    )
)
%PY% -c "import requests, bs4, openpyxl, lawcrawler.rules, lawcrawler.site, lawcrawler.storage"
if errorlevel 1 (
    echo ERROR: Dependencies or crawler modules are missing. Run install.bat first.
    echo Shutdown will NOT be scheduled.
    pause
    exit /b 1
)
echo ================================================================
echo Five targets will run one at a time, not in parallel.
echo Scheduled and repealed laws: pages 1-20 for each K keyword.
echo Temporary laws, temporary articles, unconstitutional articles: all pages.
echo After all five return, this PC will shut down in 60 seconds.
echo WARNING: Save your work now. Windows timed shutdown may close apps forcibly.
echo Errors in an individual crawl do not cancel the final shutdown.
echo Cancel the shutdown countdown with: shutdown /a
echo ================================================================
set "LAWCRAWLER_NO_PAUSE=1"
call :run_one crawl_scheduled.bat
set "CODE_SCHEDULED=%ERRORLEVEL%"
call :run_one crawl_repealed.bat
set "CODE_REPEALED=%ERRORLEVEL%"
call :run_one crawl_temporary.bat
set "CODE_TEMPORARY=%ERRORLEVEL%"
call :run_one crawl_temporary_articles.bat
set "CODE_TEMPORARY_ARTICLES=%ERRORLEVEL%"
call :run_one crawl_unconstitutional.bat
set "CODE_UNCONSTITUTIONAL=%ERRORLEVEL%"
echo.
echo All five BAT files have returned. Exit codes:
echo scheduled=%CODE_SCHEDULED%, repealed=%CODE_REPEALED%, temporary=%CODE_TEMPORARY%
echo temporary_articles=%CODE_TEMPORARY_ARTICLES%, unconstitutional=%CODE_UNCONSTITUTIONAL%
echo 0=complete, 1=error, 2=partial, no results, or source file format warning.
echo Scheduling PC shutdown in 60 seconds. To cancel, run: shutdown /a
"%SystemRoot%\System32\shutdown.exe" /s /t 60
if errorlevel 1 (
    echo ERROR: Windows did not accept the shutdown request.
    pause
    exit /b 1
)
exit /b 0

:run_one
echo.
echo ===== Starting %~1 =====
call "%~dp0%~1"
set "CHILD_RESULT=%ERRORLEVEL%"
echo ===== Finished %~1, exit code %CHILD_RESULT% =====
exit /b %CHILD_RESULT%

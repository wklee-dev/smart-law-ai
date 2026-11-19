@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM Batch OPEN API law crawl - run from this folder only
REM   run_batch_openlaw_crawl.bat       = all targets
REM   run_batch_openlaw_crawl.bat skip  = skip already collected
REM   run_batch_openlaw_crawl.bat dry   = preview only

set "PYTHON=python"
if defined PYTHON_PATH set "PYTHON=%PYTHON_PATH%"

set "MODE=%~1"
if /I "%MODE%"=="skip" goto RUN_SKIP
if /I "%MODE%"=="dry" goto RUN_DRY
goto RUN_ALL

:RUN_SKIP
echo [OPENLAW BATCH] skip already collected...
"%PYTHON%" "%~dp0batch_openlaw_crawl.py" --all --skip-collected -y
goto DONE

:RUN_DRY
echo [OPENLAW BATCH] dry-run preview...
"%PYTHON%" "%~dp0batch_openlaw_crawl.py" --all --dry-run
goto DONE

:RUN_ALL
echo [OPENLAW BATCH] run all targets...
"%PYTHON%" "%~dp0batch_openlaw_crawl.py" --all -y
goto DONE

:DONE
set EXITCODE=%ERRORLEVEL%
echo.
echo Exit code: %EXITCODE%

echo ================================================
echo  Shutdown in 60 seconds.
echo ================================================
shutdown /s /t 60

exit /b %EXITCODE%

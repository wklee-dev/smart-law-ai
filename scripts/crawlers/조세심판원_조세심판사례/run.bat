@echo off
REM ==========================================================================
REM  Tax Tribunal decision crawler V1.2 - Windows launcher
REM  Usage : run.bat [mode] [options]
REM    run.bat init-db
REM    run.bat list  --max-pages 5
REM    run.bat detail --limit 100
REM    run.bat full
REM    run.bat stats
REM
REM  After a long-running mode the PC shuts down in 60 seconds (unattended run).
REM  Cancel with : shutdown /a
REM ==========================================================================
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if "%~1"=="" (
    python run_crawl.py --help
    goto :end
)

python run_crawl.py %*
set RC=%ERRORLEVEL%
if not "%RC%"=="0" echo [ERROR] exit code = %RC%

REM Do not schedule a shutdown for the quick read-only modes.
if /i "%~1"=="init-db"   goto :end
if /i "%~1"=="check-db"  goto :end
if /i "%~1"=="net-check" goto :end
if /i "%~1"=="stats"     goto :end
if /i "%~1"=="export"    goto :end

echo.
echo Finished. PC will shut down in 60 seconds.
echo To cancel, run: shutdown /a
shutdown /s /f /t 60 /c "Crawl finished. Shutting down."

:end
echo.

endlocal
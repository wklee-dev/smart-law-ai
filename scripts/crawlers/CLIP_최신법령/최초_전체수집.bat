@echo off
setlocal
chcp 65001 > nul
set "PYTHONUTF8=1"
cd /d "%~dp0"

rem Set to 0 to disable automatic shutdown after a successful full baseline crawl.
set "SHUTDOWN_AFTER_SUCCESS=1"
set "SHUTDOWN_DELAY_SECONDS=60"
set "LOG_FILE=logs\clip_latest_laws_full.log"

if not exist logs mkdir logs

echo ================================================================
echo CLIP Latest Laws - Full Baseline Crawl
echo Database: D:\SQLiteDB\smart_law_ai.db
echo Log file: %~dp0%LOG_FILE%
echo Live progress is displayed below and saved as UTF-8 in the log file.
echo ================================================================
echo.

rem The crawler writes normal progress to stdout and the UTF-8 log file itself.
rem This avoids PowerShell NativeCommandError records for normal INFO messages.
py -3 .\crawl_latest_laws.py --full --log-level INFO --log-file "%LOG_FILE%"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo ================================================================
echo Full baseline crawl completed. Exit code: %EXIT_CODE%
echo Log: %~dp0%LOG_FILE%
echo ================================================================

if "%EXIT_CODE%"=="0" (
    if "%SHUTDOWN_AFTER_SUCCESS%"=="1" (
        echo.
        echo The crawl completed successfully.
        echo This PC will shut down automatically in %SHUTDOWN_DELAY_SECONDS% seconds.
        echo To cancel the shutdown, run: shutdown /a
        shutdown /s /t %SHUTDOWN_DELAY_SECONDS% /c "CLIP full baseline crawl completed successfully."
    ) else (
        echo.
        echo Automatic shutdown is disabled by SHUTDOWN_AFTER_SUCCESS=0.
    )
) else (
    echo.
    echo Automatic shutdown was not scheduled because the crawl did not complete successfully.
)

exit /b %EXIT_CODE%

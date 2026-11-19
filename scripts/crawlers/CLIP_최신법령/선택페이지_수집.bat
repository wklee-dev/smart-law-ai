@echo off
setlocal
chcp 65001 > nul
set "PYTHONUTF8=1"
cd /d "%~dp0"

set "PAGES="
set /p PAGES="Enter the list page or page range to crawl (for example: 1 or 1,3-5): "
if not defined PAGES (
    echo No page number was entered. The crawl was cancelled.
    exit /b 1
)

set "LOG_FILE=logs\clip_latest_laws_selected_pages.log"
if not exist logs mkdir logs
echo.
echo ================================================================
echo CLIP Latest Laws - Selected-Page Crawl
echo Selected pages: %PAGES%
echo Database: D:\SQLiteDB\smart_law_ai.db
echo Log file: %~dp0%LOG_FILE%
echo Live progress is displayed below and saved as UTF-8 in the log file.
echo ================================================================
echo.
py -3 .\crawl_latest_laws.py --pages "%PAGES%" --log-level INFO --log-file "%LOG_FILE%"
set EXIT_CODE=%ERRORLEVEL%

echo.
echo Selected-page crawl completed. Exit code: %EXIT_CODE%
echo Log: %~dp0%LOG_FILE%
exit /b %EXIT_CODE%

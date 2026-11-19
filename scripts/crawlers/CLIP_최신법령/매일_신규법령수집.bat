@echo off
setlocal
chcp 65001 > nul
set "PYTHONUTF8=1"
cd /d "%~dp0"

set "LOG_FILE=logs\clip_latest_laws_daily.log"
if not exist logs mkdir logs
echo ================================================================
echo CLIP Latest Laws - Daily Incremental Crawl
echo Database: D:\SQLiteDB\smart_law_ai.db
echo Log file: %~dp0%LOG_FILE%
echo Live progress is displayed below and saved as UTF-8 in the log file.
echo ================================================================
echo.
py -3 .\crawl_latest_laws.py --incremental --log-level INFO --log-file "%LOG_FILE%"
set EXIT_CODE=%ERRORLEVEL%

echo.
echo Incremental crawl completed. Exit code: %EXIT_CODE%
echo Newly registered law names are shown in the output and log.
echo Log: %~dp0%LOG_FILE%
exit /b %EXIT_CODE%

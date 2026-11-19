@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 (
    echo Python launcher not found. Install Python 3 and try again.
    exit /b 9009
)

py clip_treaty_crawler.py --start-page 1
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0" (
    echo Crawl completed successfully.
) else if "%EXIT_CODE%"=="2" (
    echo Crawl completed with attachment errors. Check the SQLite crawl tables.
) else (
    echo Crawl failed. Exit code: %EXIT_CODE%
)

echo All jobs completed.
rem shutdown /s /f /t 60

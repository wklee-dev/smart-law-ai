@echo off
setlocal
chcp 65001 > nul
set "PYTHONUTF8=1"
cd /d "%~dp0"

py -3 crawl_latest_laws.py --show-latest-names --new-name-days 7 --new-name-limit 100
set EXIT_CODE=%ERRORLEVEL%

echo.
echo Recent newly registered law name report completed. Exit code: %EXIT_CODE%
pause
exit /b %EXIT_CODE%

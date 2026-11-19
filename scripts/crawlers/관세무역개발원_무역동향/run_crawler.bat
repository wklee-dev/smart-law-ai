@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" (
    echo Usage: run_crawler.bat --page 1
    echo Example: run_crawler.bat --year 2026 --week 38
    exit /b 2
)
python run.py crawl %*
exit /b %errorlevel%

@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ===================================================
echo  Foreign HS Class - Python / package install
echo ===================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
    echo.
    echo [ERROR] Install failed.
    echo         Check network, then run this file again.
    pause
    exit /b 1
)

echo.
echo Registering weekly Task Scheduler job (Monday 04:00)...
call "%~dp0register_weekly_task.bat"
if errorlevel 1 (
    echo.
    echo [WARN] Task registration failed. Run register_weekly_task.bat as Administrator.
)

echo.
echo ===================================================
echo  Install finished.
echo  - Manual weekly run : run_weekly.bat
echo  - Yearly crawl      : run_crawler_foreign.bat [year]
echo  - Example           : python customs_foreign_cases_crawler.py --week 2026-35 --country ALL
echo ===================================================
pause
exit /b 0

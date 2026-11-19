@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo Registering Task Scheduler job: every Monday 04:00
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0register_weekly_task.ps1"
if errorlevel 1 (
    echo.
    echo [ERROR] Registration failed.
    echo         Right-click this file - Run as administrator.
    exit /b 1
)
exit /b 0

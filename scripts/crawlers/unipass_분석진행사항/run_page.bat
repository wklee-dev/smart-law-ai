@echo off
setlocal
cd /d "%~dp0"

python main.py --page-range 1-1

if errorlevel 1 (
    echo.
    echo Command failed. See the log file for details.
) else (
    echo.
    echo Command completed.
)

echo All jobs completed.
rem shutdown /s /f /t 60
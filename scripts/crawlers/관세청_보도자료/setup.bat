@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
    py -3 -m pip install -r "%~dp0requirements.txt"
) else (
    python -m pip install -r "%~dp0requirements.txt"
)
if errorlevel 1 (
    echo Installation failed. Check Python and internet access.
    pause
    exit /b 1
)
echo Installation complete.
pause
exit /b 0

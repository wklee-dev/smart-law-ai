@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
    py -3 -m pip install -r requirements.txt
) else (
    python -m pip install -r requirements.txt
)
set "exitcode=%errorlevel%"
if not "%exitcode%"=="0" echo Installation failed. Check Python, pip, and network access.
pause
exit /b %exitcode%

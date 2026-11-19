@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 -m pip install --user -r requirements.txt
) else (
  python -m pip install --user -r requirements.txt
)
if errorlevel 1 (
  echo Installation failed. Check Python, pip and network access.
  pause
  exit /b 1
)
echo Installation completed. No virtual environment was created.
pause

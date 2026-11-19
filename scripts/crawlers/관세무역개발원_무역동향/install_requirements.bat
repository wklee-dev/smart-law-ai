@echo off
setlocal
cd /d "%~dp0"
python -m pip install --user -r requirements.txt
if errorlevel 1 (
    echo Installation failed. Check Python and Internet access.
    exit /b 1
)
echo Installation completed.

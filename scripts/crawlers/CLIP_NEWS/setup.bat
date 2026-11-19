@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set "PYTHONUTF8=1"
call "%~dp0find_python.bat"
if errorlevel 1 goto failed
echo Using Python: "%PYTHON_EXE%"
echo Installing dependencies for the current user. No environment will be created.
"%PYTHON_EXE%" -m pip --version >nul 2>nul
if not errorlevel 1 goto install
"%PYTHON_EXE%" -m ensurepip --user
if errorlevel 1 goto failed
:install
"%PYTHON_EXE%" -m pip install --user -r "%~dp0requirements.txt"
if errorlevel 1 goto failed
"%PYTHON_EXE%" -c "import requests, bs4; print('Dependencies are ready.')"
if errorlevel 1 goto failed
echo Setup completed. Run run.bat for initial or incremental crawling.
exit /b 0
:failed
echo Setup failed. Check the message above.
exit /b 1

@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set "PYTHONUTF8=1"
call "%~dp0find_python.bat"
if errorlevel 1 goto failed
"%PYTHON_EXE%" -m pip install --user "pytest>=8,<10"
if errorlevel 1 goto failed
"%PYTHON_EXE%" -m pytest -q tests
set "RESULT=%ERRORLEVEL%"
exit /b %RESULT%
:failed
echo Test setup failed. Run setup.bat and check Python installation.
exit /b 1

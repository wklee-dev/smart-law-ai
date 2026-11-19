@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set "PYTHONUTF8=1"
call "%~dp0find_python.bat"
if errorlevel 1 goto failed
"%PYTHON_EXE%" -c "import requests, bs4" >nul 2>nul
if errorlevel 1 (
    echo Dependencies are missing. Run setup.bat first.
    goto failed
)
"%PYTHON_EXE%" "%~dp0crawler.py" --db-path "%~dp0test_output\test.db" --download-root "%~dp0test_output\downloads" --pages "" --max-notices 3
set "RESULT=%ERRORLEVEL%"
echo Exit code 2 is expected when the sample limit is applied.
exit /b %RESULT%
:failed
exit /b 1

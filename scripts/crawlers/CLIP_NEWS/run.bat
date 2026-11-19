@echo off
setlocal
echo ============================================================
echo Customs Administrative Notice Crawler V1.3
echo Starting... No virtual environment is created or used.
echo ============================================================
cd /d "%~dp0"
chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONUNBUFFERED=1"
echo [1/3] Locating installed Python...
call "%~dp0find_python.bat"
if errorlevel 1 goto failed
echo Python: "%PYTHON_EXE%"
echo [2/3] Checking required libraries...
"%PYTHON_EXE%" -c "import requests, bs4" >nul 2>nul
if errorlevel 1 (
    echo Dependencies are missing. Run setup.bat first.
    goto failed
)
echo [3/3] Starting crawler. Progress will be displayed below.
"%PYTHON_EXE%" -u "%~dp0crawler.py" %*
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" echo Requested crawl scope completed successfully.
if "%RESULT%"=="2" echo Sample limit or individual errors detected. See logs and rerun.
if "%RESULT%"=="1" echo Crawl failed. See logs and configuration.
if "%RESULT%"=="130" echo Crawl interrupted. Rerun to resume.
exit /b %RESULT%
:failed
echo Crawler could not start. Check the message above.
exit /b 1

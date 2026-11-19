@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "PYTHONUTF8=1"
cd /d "%~dp0"

call :resolve_python
if errorlevel 2 goto python_version_failed
if errorlevel 1 goto python_not_found

%PYTHON_CMD% -c "import requests, bs4" >nul 2>&1
if errorlevel 1 goto packages_missing

%PYTHON_CMD% crawler.py --config config.json --retry-failed %*
set "RESULT=%ERRORLEVEL%"
endlocal & exit /b %RESULT%

:resolve_python
where py >nul 2>&1
if not errorlevel 1 (
    py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 2)" >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON_CMD=py -3"
        exit /b 0
    )
)
where python >nul 2>&1
if errorlevel 1 exit /b 1
python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 2)" >nul 2>&1
if errorlevel 1 exit /b 2
set "PYTHON_CMD=python"
exit /b 0

:python_not_found
echo [ERROR] Python 3.10 or later was not found. Run setup.bat after installing Python.
endlocal & exit /b 1

:python_version_failed
echo [ERROR] Python 3.10 or later is required.
endlocal & exit /b 1

:packages_missing
echo [ERROR] Required packages are missing. Run setup.bat.
endlocal & exit /b 1

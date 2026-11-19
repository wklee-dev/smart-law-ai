@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONUNBUFFERED=1"
cd /d "%~dp0"
echo [INFO] Starting Tax Tribunal crawler. Preparing daily log...

set "LOG_DIR=LOG"
if not exist "%LOG_DIR%\" mkdir "%LOG_DIR%" >nul 2>&1
if not exist "%LOG_DIR%\" goto log_dir_failed

set "LOG_DATE="
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd" 2^>nul') do set "LOG_DATE=%%I"
if not defined LOG_DATE set "LOG_DATE=unknown_date"
set "LOG_FILE=%LOG_DIR%\%LOG_DATE%_TaxTribunalPress.LOG"

call :log INFO "run_all.bat started. Arguments: %*"
call :log INFO "Working directory: %CD%"
call :log INFO "Using system Python. No virtual environment is used."
call :log INFO "Checking installed Python and required packages..."

call :resolve_python
if errorlevel 2 goto python_version_failed
if errorlevel 1 goto python_not_found

%PYTHON_CMD% -c "import requests, bs4" >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto packages_missing
if not exist "run_console.py" goto runner_missing

set "TAX_TRIBUNAL_LOG_FILE=%CD%\%LOG_FILE%"
call :log INFO "Python ready. Progress will be shown here and saved to the daily log."
%PYTHON_CMD% -u run_console.py --config config.json %*
set "RESULT=%ERRORLEVEL%"
call :log INFO "run_all.bat finished. Exit code: %RESULT%"
echo [INFO] Exit code: %RESULT%. Log: %LOG_FILE%
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
call :log ERROR "Python 3 launcher and python command were not found. Run setup.bat after installing Python 3.10 or later."
echo [INFO] Log: %LOG_FILE%
endlocal & exit /b 1

:python_version_failed
call :log ERROR "Python 3.10 or later is required."
echo [INFO] Log: %LOG_FILE%
endlocal & exit /b 1

:packages_missing
call :log ERROR "Required packages are missing. Run setup.bat."
echo [INFO] Log: %LOG_FILE%
endlocal & exit /b 1

:runner_missing
call :log ERROR "run_console.py is missing. Copy all V1.4 program files together."
endlocal & exit /b 1

:log_dir_failed
echo [ERROR] Unable to create LOG directory. Check folder permissions.
endlocal & exit /b 1

:log
echo [%DATE% %TIME%] %~1 %~2
>> "%LOG_FILE%" echo [%DATE% %TIME%] %~1 %~2
exit /b 0

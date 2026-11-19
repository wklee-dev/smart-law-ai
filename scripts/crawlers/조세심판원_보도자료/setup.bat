@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "PYTHONUTF8=1"
cd /d "%~dp0"

echo [INFO] Using system Python. No virtual environment will be created.
call :resolve_python
if errorlevel 2 goto python_version_failed
if errorlevel 1 goto python_not_found

echo [INFO] Upgrading pip for the current Windows user...
%PYTHON_CMD% -m pip install --user --upgrade pip
if errorlevel 1 goto pip_failed

echo [INFO] Installing required packages for the current Windows user...
%PYTHON_CMD% -m pip install --user -r requirements.txt
if errorlevel 1 goto packages_failed

echo [INFO] Setup completed successfully. No isolated environment was created.
endlocal & exit /b 0

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
echo [ERROR] Python 3 launcher and python command were not found. Install Python 3.10 or later.
endlocal & exit /b 1

:python_version_failed
echo [ERROR] Python 3.10 or later is required.
endlocal & exit /b 1

:pip_failed
echo [ERROR] Failed to upgrade pip for the current Windows user.
echo [ERROR] Check pip, network access, and your organization's package installation policy.
endlocal & exit /b 1

:packages_failed
echo [ERROR] Failed to install required packages for the current Windows user.
echo [ERROR] Check pip, network access, and your organization's package installation policy.
endlocal & exit /b 1

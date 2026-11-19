@echo off
rem Resolve python.exe and set PYTHON_CMD (full path).
rem Priority: portable .\python\python.exe -> py -3 -> python on PATH

set "PYTHON_CMD="

if exist "%~dp0python\python.exe" (
    set "PYTHON_CMD=%~dp0python\python.exe"
    exit /b 0
)

for /f "delims=" %%i in ('py -3 -c "import sys;print(sys.executable)" 2^>nul') do (
    if exist "%%i" (
        set "PYTHON_CMD=%%i"
        exit /b 0
    )
)

for /f "delims=" %%i in ('python -c "import sys;print(sys.executable)" 2^>nul') do (
    if exist "%%i" (
        set "PYTHON_CMD=%%i"
        exit /b 0
    )
)

echo [ERROR] Python not found. Run install.bat first.
exit /b 1

@echo off
rem Called by other batch files. Returns PYTHON_EXE without creating any environment.
set "PYTHON_EXE="
where py >nul 2>nul
if not errorlevel 1 (
    for /f "delims=" %%P in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do set "PYTHON_EXE=%%P"
)
if defined PYTHON_EXE goto validate
where python >nul 2>nul
if not errorlevel 1 (
    for /f "delims=" %%P in ('python -c "import sys; print(sys.executable)" 2^>nul') do set "PYTHON_EXE=%%P"
)
if defined PYTHON_EXE goto validate
echo Python 3.10 or later was not found. Install Python and enable PATH or Python Launcher.
exit /b 1
:validate
"%PYTHON_EXE%" -c "import sys; assert sys.version_info >= (3,10), 'Python 3.10+ required'; assert sys.prefix == sys.base_prefix, 'Use a regular Python installation'" >nul 2>nul
if errorlevel 1 (
    echo Python 3.10+ outside an activated environment is required.
    echo Close activated environment terminals and use a regular Python installation.
    set "PYTHON_EXE="
    exit /b 1
)
exit /b 0

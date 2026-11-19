@echo off
chcp 65001 > nul
cd /d "%~dp0"

rem ============================================================
rem  Weekly crawler: previous ISO week (last completed week)
rem  Usage:
rem    run_weekly.bat
rem    run_weekly.bat 2026-35
rem    run_weekly.bat 2026-35 --force
rem    run_weekly.bat --force
rem  Example: python customs_foreign_cases_crawler.py --week 2026-35 --country ALL
rem ============================================================

call "%~dp0find_python.bat"
if errorlevel 1 (
    echo [ERROR] Python not found. Run install.bat first.
    exit /b 1
)

if not exist "D:\SQLiteDB" mkdir "D:\SQLiteDB"
if not exist "%~dp0logs" mkdir "%~dp0logs"

set "WEEK="
set "FORCE="

if /i "%~1"=="--force" (
    set "FORCE=--force"
) else if not "%~1"=="" (
    set "WEEK=%~1"
    if /i "%~2"=="--force" set "FORCE=--force"
)

if "%WEEK%"=="" (
    for /f "delims=" %%i in ('"%PYTHON_CMD%" -c "from datetime import datetime,timedelta;d=datetime.now()-timedelta(days=7);iso=d.isocalendar();print('{}-{}'.format(iso[0],iso[1]))"') do set "WEEK=%%i"
)

if "%WEEK%"=="" (
    echo [ERROR] Failed to resolve last ISO week.
    exit /b 1
)

echo ===================================================
echo  Weekly crawl start
echo  Week : %WEEK%
echo  DB   : D:\SQLiteDB\hsforeigncase.db
echo  Cmd  : customs_foreign_cases_crawler.py --week %WEEK% --country ALL %FORCE%
echo ===================================================

"%PYTHON_CMD%" "%~dp0customs_foreign_cases_crawler.py" --week %WEEK% --country ALL --db "D:\SQLiteDB\hsforeigncase.db" %FORCE%
set "RC=%ERRORLEVEL%"

if %RC% NEQ 0 (
    echo [ERROR] Crawler exit code: %RC%
    exit /b %RC%
)

echo ===================================================
echo  Weekly crawl done. Week=%WEEK%
echo ===================================================
exit /b 0

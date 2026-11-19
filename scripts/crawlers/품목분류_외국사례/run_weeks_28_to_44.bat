@echo off
setlocal EnableDelayedExpansion
chcp 65001 > nul
cd /d "%~dp0"

rem ============================================================
rem  Crawl ISO weeks 28 through 44 (inclusive) with --force
rem  Usage:
rem    run_weeks_28_to_44.bat
rem    run_weeks_28_to_44.bat 2026
rem  Example:
rem    python customs_foreign_cases_crawler.py --week 2026-28 --country ALL --force
rem ============================================================

call "%~dp0find_python.bat"
if errorlevel 1 (
    echo [ERROR] Python not found. Run install.bat first.
    exit /b 1
)

if not exist "D:\SQLiteDB" mkdir "D:\SQLiteDB"
if not exist "%~dp0logs" mkdir "%~dp0logs"

set "YEAR=%~1"
if "%YEAR%"=="" set "YEAR=2026"

set "START_WEEK=28"
set "END_WEEK=44"
set "DB_PATH=D:\SQLiteDB\hsforeigncase.db"
set "FORCE=--force"

echo ===================================================
echo  Week range crawl start
echo  Year       : %YEAR%
echo  Weeks      : %START_WEEK% - %END_WEEK%
echo  DB         : %DB_PATH%
echo  Options    : --country ALL %FORCE%
echo ===================================================

for /L %%W in (%START_WEEK%,1,%END_WEEK%) do (
    echo.
    echo ---------------------------------------------------
    echo  Week %YEAR%-%%W [START]
    echo ---------------------------------------------------
    "%PYTHON_CMD%" "%~dp0customs_foreign_cases_crawler.py" --week %YEAR%-%%W --country ALL --db "%DB_PATH%" %FORCE%
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Crawler failed on week %YEAR%-%%W  exit code: !ERRORLEVEL!
        exit /b !ERRORLEVEL!
    )
    echo  Week %YEAR%-%%W [DONE]
)

echo ===================================================
echo  Week range crawl done. Year=%YEAR% Weeks=%START_WEEK%-%END_WEEK%
echo ===================================================
exit /b 0

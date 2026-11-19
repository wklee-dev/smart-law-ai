@echo off
chcp 65001 >nul
setlocal
if "%~1"=="" (
    echo 사용 예:
    echo   run.bat crawl --start-date 20260301 --end-date 20261110
    echo   run.bat crawl --year 2026 --week 46
    echo   run.bat history
    exit /b 2
)
pushd "%~dp0"
if errorlevel 1 exit /b 1
python "%~dp0run.py" %*
set "EXIT_CODE=%errorlevel%"
popd
echo Complete ^(errorlevel: %EXIT_CODE%^)
exit /b %EXIT_CODE%

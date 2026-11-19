@echo off
setlocal EnableExtensions

set "JOB1=D:\Crawling\unipass_분석진행사항\run_page.bat"
set "JOB2=D:\Crawling\unipass_전자등기우편발송목록\run_weeks.bat"

echo ============================================================
echo Starting job 1 of 2: analysis progress crawler
if not exist "%JOB1%" (
    echo ERROR: Job 1 batch file was not found.
    echo %JOB1%
    exit /b 1
)

call "%JOB1%"
set "JOB1_EXIT=%ERRORLEVEL%"
if not "%JOB1_EXIT%"=="0" (
    echo ERROR: Job 1 failed with exit code %JOB1_EXIT%.
    echo Job 2 will not be started.
    exit /b %JOB1_EXIT%
)

echo.
echo ============================================================
echo Starting job 2 of 2: registered mail crawler
if not exist "%JOB2%" (
    echo ERROR: Job 2 batch file was not found.
    echo %JOB2%
    exit /b 1
)

call "%JOB2%"
set "JOB2_EXIT=%ERRORLEVEL%"
if not "%JOB2_EXIT%"=="0" (
    echo ERROR: Job 2 failed with exit code %JOB2_EXIT%.
    exit /b %JOB2_EXIT%
)

echo.
echo All jobs completed successfully.
exit /b 0

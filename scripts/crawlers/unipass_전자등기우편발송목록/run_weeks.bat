@echo off
setlocal EnableExtensions

REM UNI-PASS 전자등기 우편발송 목록 크롤러: 한 번 로그인으로 여러 주차 처리
REM
REM 기본 실행: 2026년 22~35주차
REM   run_weeks.bat
REM
REM 실행 범위 변경: YEAR START_WEEK END_WEEK
REM   run_weeks.bat 2026 22 35
REM
REM 중요: 이 배치 파일은 Python을 FOR 루프로 여러 번 실행하지 않습니다.
REM Python 프로세스 1개와 Chrome 브라우저 1개만 실행하므로 주차마다 재로그인하지 않습니다.

cd /d "%~dp0"

set "YEAR=2026"
set "START_WEEK=22"
set "END_WEEK=35"

if not "%~1"=="" set "YEAR=%~1"
if not "%~2"=="" set "START_WEEK=%~2"
if not "%~3"=="" set "END_WEEK=%~3"

set "PYTHON="
where py >nul 2>&1
if not errorlevel 1 set "PYTHON=py -3"

if not defined PYTHON (
    where python >nul 2>&1
    if not errorlevel 1 set "PYTHON=python"
)

if not defined PYTHON (
    echo [ERROR] Python was not found. Install Python or add it to PATH.
    exit /b 2
)

if not exist "unipass_post_crawler.py" (
    echo [ERROR] unipass_post_crawler.py was not found in:
    echo         %CD%
    exit /b 2
)

if not exist ".env" (
    echo [ERROR] .env was not found in:
    echo         %CD%
    echo Copy env.example to .env, then set UNIPASS_ID and UNIPASS_PW.
    exit /b 2
)

echo.
echo ============================================================
echo UNI-PASS crawler v10: one browser and one login session
echo Year: %YEAR%  /  Weeks: %START_WEEK% through %END_WEEK%
echo ============================================================
echo.

REM One Python command only. --week-end is processed inside the same login session.
%PYTHON% unipass_post_crawler.py --year %YEAR% --week %START_WEEK% --week-end %END_WEEK%
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
    echo [DONE] All requested weeks completed in one login session.
) else (
    echo [STOPPED] Crawler ended with code %EXIT_CODE%.
    echo          It was NOT restarted automatically. Check the newest log file.
)

REM Do not add shutdown or a week-by-week FOR loop here.
exit /b %EXIT_CODE%

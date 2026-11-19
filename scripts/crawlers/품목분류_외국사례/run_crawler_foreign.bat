@echo off
chcp 65001 > nul
cd /d "%~dp0"

call "%~dp0find_python.bat"
if errorlevel 1 (
    echo [오류] Python이 없습니다. 먼저 install.bat 을 실행하세요.
    pause
    exit /b 1
)

rem 실행할 때 연도 매개변수가 없으면 안내 메시지 출력
if "%~1"=="" (
    echo [사용법] run_crawler_foreign.bat [연도]
    echo [예 시] run_crawler_foreign.bat 2025
    echo [예 시] run_crawler_foreign.bat 2026
    pause
    exit /b
)

set YEAR=%~1

rem 기본(디폴트) 주차는 52주로 설정
set MAX_WEEK=52

rem 입력받은 연도가 53주차까지 있는 해인지 체크/ 2026년도 53주지만 8-9일(32주차까지만 진행)
if "%YEAR%"=="1992" set MAX_WEEK=53
if "%YEAR%"=="2004" set MAX_WEEK=53
if "%YEAR%"=="2020" set MAX_WEEK=53
if "%YEAR%"=="2026" set MAX_WEEK=32

echo ===================================================
echo  %YEAR%년 크롤링 배치를 시작합니다. (자동 감지된 총 주차: %MAX_WEEK%주)
echo ===================================================

for /L %%G in (1,1,%MAX_WEEK%) do (
    echo.
    echo ---------------------------------------------------
    echo  현재 진행 주차: %YEAR%-%%G [시작]
    echo ---------------------------------------------------
    
    "%PYTHON_CMD%" "%~dp0customs_foreign_cases_crawler.py" --week %YEAR%-%%G --country ALL --db "D:\SQLiteDB\hsforeigncase.db"
    
    echo ---------------------------------------------------
    echo  %YEAR%-%%G 주차 작업 완료.
    echo ---------------------------------------------------
)

echo.
echo ===================================================
echo  %YEAR%년 (%MAX_WEEK%주차까지) 모든 작업이 완료되었습니다.
echo ===================================================
rem pause
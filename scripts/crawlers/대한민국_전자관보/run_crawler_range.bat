@echo off
chcp 65001 > nul
REM =====================================================================
REM  대한민국 전자관보 크롤러 - 페이지 범위(From ~ To) 수집
REM  명령줄 인자로 전달 가능: run_crawler_range.bat 1 5
REM  인자 없이 실행 시 사용자 입력을 받습니다.
REM =====================================================================
echo.
echo ================================================================
echo   Gwanbo Crawler - Page Range Mode (From ~ To)
echo ================================================================
echo.
set FROM_PAGE=%1
set TO_PAGE=%2
if "%FROM_PAGE%"=="" (
    set /p FROM_PAGE=Start page (From): 
)
if "%TO_PAGE%"=="" (
    set /p TO_PAGE=End page   (To)  : 
)
echo.
echo Collecting pages %FROM_PAGE% ~ %TO_PAGE% ...
python gwanbo_crawler.py --from-page %FROM_PAGE% --to-page %TO_PAGE%
echo.
echo [Finished]
pause

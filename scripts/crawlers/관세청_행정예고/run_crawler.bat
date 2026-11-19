@echo off
chcp 65001 > nul
title 관세청 행정예고 크롤러

cd /d "%~dp0"

echo ======================================================================
echo   관세청 행정규칙 행정예고 크롤러 (v3.1)
echo   목록 + 본문(HTML/텍스트) + 첨부파일을 완전 자동으로 다운로드합니다.
echo ======================================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] Python이 설치되어 있지 않습니다. install.bat 를 먼저 실행하세요.
    pause
    exit /b 1
)

:: 1) 명령줄 인자가 있으면 그대로 실행 (예: run_crawler.bat 1 5 또는 run_crawler.bat 1)
if not "%1"=="" (
    python customs_crawler.py %*
    goto end
)

:: 2) 인자가 없으면 시작/종료페이지만 입력받아 바로 다운로드 (선택 메뉴 없음)
echo [페이지 지정 다운로드] - 원하는 시작/종료페이지만 입력하세요.
echo   (그냥 Enter 치면 1페이지가 자동 수집됩니다)
echo.
set /p FROM=시작 페이지 (Enter=1) : 
set /p TO=종료 페이지 (Enter=시작페이지) : 
if "%FROM%"=="" set FROM=1
if "%TO%"=="" set TO=%FROM%

echo.
echo [시작] %FROM%페이지 ~ %TO%페이지 자동 다운로드를 시작합니다...
echo.
python customs_crawler.py %FROM% %TO%

:end
echo.
echo [완료] 작업이 끝났습니다. 로그는 logs 폴더를 확인하세요.
pause

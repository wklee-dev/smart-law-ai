@echo off
chcp 65001 > nul
title 관세청 행정예고 크롤러 - 1페이지 자동 수집

cd /d "%~dp0"

echo ======================================================================
echo   1페이지 자동 통합 수집 (목록 + 본문 + 첨부파일)
echo   선택 입력 없이 즉시 자동으로 수집을 시작합니다.
echo ======================================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] Python이 설치되어 있지 않습니다. install.bat 를 먼저 실행하세요.
    pause
    exit /b 1
)

python customs_crawler.py 1
echo.
echo [완료] 작업이 끝났습니다.
pause

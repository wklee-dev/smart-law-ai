@echo off
chcp 65001 > nul
title 관세청 행정예고 크롤러 - 1단계(목록 정보만) 자동 수집

cd /d "%~dp0"

echo ======================================================================
echo   1단계(목록 메타) 자동 수집 - 본문/첨부 없이 목록만 빠르게 수집
echo   사용법: run_stage1.bat [페이지번호] 또는 run_stage1.bat [시작] [종료]
echo ======================================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] Python이 설치되어 있지 않습니다. install.bat 를 먼저 실행하세요.
    pause
    exit /b 1
)

python customs_crawler.py --stage 1 %*
echo.
pause

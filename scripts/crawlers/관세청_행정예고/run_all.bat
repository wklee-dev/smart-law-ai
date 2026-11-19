@echo off
chcp 65001 > nul
title 관세청 행정예고 크롤러 - 전체 페이지 자동 수집

cd /d "%~dp0"

echo ======================================================================
echo   전체 페이지(약 146페이지, 1,450여건) 자동 통합 수집
echo   폐지제정 등 모든 공고를 조건 없이 100%% 자동 수집합니다.
echo   진행 중 Ctrl+C를 누르면 안전하게 중단됩니다.
echo ======================================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] Python이 설치되어 있지 않습니다. install.bat 를 먼저 실행하세요.
    pause
    exit /b 1
)

python customs_crawler.py all
echo.
echo [완료] 전체 페이지 수집이 끝났습니다.
pause

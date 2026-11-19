@echo off
chcp 65001 > nul
title 관세청 행정예고 크롤러 - 실패 첨부파일 재시도

cd /d "%~dp0"

echo ======================================================================
echo   다운로드 실패('FAILED') 상태인 첨부파일만 다시 받습니다.
echo ======================================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] Python이 설치되어 있지 않습니다. install.bat 를 먼저 실행하세요.
    pause
    exit /b 1
)

python customs_crawler.py --retry-failed
echo.
pause

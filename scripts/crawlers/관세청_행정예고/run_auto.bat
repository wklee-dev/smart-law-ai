@echo off
chcp 65001 > nul
title 관세청 행정예고 크롤러 - 무입력 자동 수집

cd /d "%~dp0"

echo ======================================================================
echo   config.ini 설정에 따라 시작/종료페이지를 완전 자동 다운로드합니다.
echo   (아무것도 입력하지 않아도 즉시 실행됩니다)
echo   * 현재 설정 변경은 config.ini 의 start_page / end_page 를 수정하세요.
echo ======================================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] Python이 설치되어 있지 않습니다. install.bat 를 먼저 실행하세요.
    pause
    exit /b 1
)

python customs_crawler.py
echo.
pause

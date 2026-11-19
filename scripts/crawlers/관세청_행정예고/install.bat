@echo off
chcp 65001 > nul
title 관세청 행정예고 크롤러 - 필수 라이브러리 설치

echo ============================================================
echo   관세청 행정예고 크롤러 - 필수 라이브러리 설치 (가상환경 불필요)
echo ============================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] Python이 설치되어 있지 않거나 PATH에 등록되지 않았습니다.
    echo https://www.python.org 에서 Python 3.8 이상을 설치하고
    echo 설치 시 "Add python.exe to PATH" 옵션을 반드시 체크해 주세요.
    echo.
    pause
    exit /b 1
)

echo [1/3] Python 버전 확인:
python --version
echo.

echo [2/3] pip 최신화 (선택):
python -m pip install --upgrade pip -q
echo.

echo [3/3] 필수 라이브러리 설치 (requests, beautifulsoup4, lxml):
python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo [오류] 패키지 설치 중 오류가 발생했습니다. 네트워크 상태를 확인해 주세요.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   설치가 완료되었습니다!
echo   이제 run_crawler.bat 또는 run_full.bat 를 실행하세요.
echo ============================================================
echo.
pause

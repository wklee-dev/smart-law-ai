@echo off
setlocal
chcp 65001 > nul

echo.
echo 관세법령정보포털 CLIP 조약/협정 페이지 수집
set /p PAGE=수집할 목록 페이지 번호를 입력하세요: 

if "%PAGE%"=="" (
    echo 페이지 번호를 입력해야 합니다.
    pause
    exit /b 1
)

py "%~dp0clip_treaty_crawler.py" --page %PAGE%
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
    echo 종료 코드: %EXIT_CODE%
)


echo All jobs completed.
rem shutdown /s /f /t 60

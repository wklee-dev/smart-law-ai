@echo off
chcp 65001 > nul
title 관세청 행정예고 크롤러 - 2단계(본문·첨부파일) 자동 수집

cd /d "%~dp0"

echo ======================================================================
echo   2단계(본문 및 첨부파일) 자동 수집
echo   DB에 적재된 공고 중 아직 상세가 수집되지 않은 건만 자동으로 완료합니다.
echo   - 전체 미수집 자동 처리 : run_stage2.bat (인자 없음)
echo   - 특정 공고번호 1건 재수집 : run_stage2.bat --seq 1451 --force
echo   - 건수 제한 처리 : run_stage2.bat --limit 100
echo ======================================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] Python이 설치되어 있지 않습니다. install.bat 를 먼저 실행하세요.
    pause
    exit /b 1
)

python customs_crawler.py --stage 2 %*
echo.
pause

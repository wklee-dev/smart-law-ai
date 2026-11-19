@echo off
chcp 65001 > nul
title 관세청 행정예고 크롤러 - 통합 수집 (Stage 1 + Stage 2)

cd /d "%~dp0"

echo ======================================================================
echo   통합 수집 (Stage 1 목록 + Stage 2 본문/첨부파일)
echo ======================================================================
echo.
echo 수집 방식을 선택하세요:
echo   [1] 1페이지만 빠른 수집 (기본, 테스트용)
echo   [2] 시작/종료 페이지 지정 (From ~ To)
echo   [3] 전체 페이지 수집 (1 ~ 끝)
echo.
set /p MODE=선택 번호 [기본 1]: 
if "%MODE%"=="" set MODE=1

if "%MODE%"=="1" (
    echo.
    echo >>> 1페이지 통합 수집 시작...
    python customs_crawler.py --stage all --page 1
    goto END
)

if "%MODE%"=="2" (
    echo.
    set /p FROM=시작 페이지(From) [기본 1]: 
    set /p TO=종료 페이지(To)   [기본 1]: 
    if "%FROM%"=="" set FROM=1
    if "%TO%"=="" set TO=1
    echo.
    echo >>> %FROM% ~ %TO% 페이지 통합 수집 시작...
    python customs_crawler.py --stage all --from-page %FROM% --to-page %TO%
    goto END
)

if "%MODE%"=="3" (
    echo.
    echo [경고] 전체 페이지 수집은 약 146페이지(1,450여건)로 1시간 이상 소요될 수 있습니다.
    set /p CONFIRM=계속하시겠습니까? (y/n): 
    if /i "%CONFIRM%"=="y" (
        echo.
        echo >>> 전체 페이지 통합 수집 시작...
        python customs_crawler.py --stage all --all-pages
    ) else (
        echo 취소되었습니다.
    )
    goto END
)

echo 잘못된 선택입니다.

:END
echo.
echo ======================================================================
echo   작업이 완료되었습니다. 로그는 logs\ 폴더를 확인하세요.
echo ======================================================================
echo.
pause

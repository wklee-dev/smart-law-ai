@echo off
chcp 65001 > nul
REM =====================================================================
REM  대한민국 전자관보 품목분류 고시 크롤러 - 전체 페이지 수집 (기본 실행)
REM  검색어: 「품목분류 변경고시」 (결과 0건 시 「품목분류」 자동 재검색)
REM  구분: 고시 / 페이징 전체 대상 / 본문 텍스트 + PDF 저장
REM =====================================================================
echo.
echo ================================================================
echo   Gwanbo Crawler - Full Crawl Mode
echo   Target: https://gwanbo.go.kr
echo   DB    : D:\SQLiteDB\smart_law_ai.db
echo   Files : C:\SQLiteDB\downloads\대한민국 전자관보\
echo   Logs  : logs\YYYYMMDD.log
echo ================================================================
echo.
python gwanbo_crawler.py
echo.
echo [Finished] Please check the logs folder for results.
pause

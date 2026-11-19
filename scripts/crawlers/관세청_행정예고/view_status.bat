@echo off
chcp 65001 > nul
title 관세청 행정예고 크롤러 - DB 현황 조회

cd /d "%~dp0"
python customs_crawler.py --status
echo.
pause

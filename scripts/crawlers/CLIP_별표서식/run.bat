
@echo off

echo ========================================
echo CLIP ANNEX Crawler Started
echo ========================================

REM Run crawler
py clip_annex_crawler.py --page-size 10 --start-page 1 --end-page 277

REM Check crawler execution result
if errorlevel 1 (
    echo.
    echo ERROR: Crawler execution failed.
    echo PC shutdown has been canceled.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Crawler Completed Successfully
echo PC will shut down in 60 seconds.
echo ========================================

REM Schedule PC shutdown after 60 seconds
shutdown /s /t 60

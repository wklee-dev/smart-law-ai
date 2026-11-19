@echo off
chcp 65001 > nul
echo ================================================
echo  연도별 크롤러 실행 시작
echo  대상: 2000,1999,1998,1997,1996,1995,1994,1993,1992,1991,1990,1989,1988년
echo ================================================
echo.

echo [1/13] 2000년 크롤링 시작...
call run_crawler_foreign.bat 2000
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 2000년 실행 중 오류 발생 - 중단합니다.
    pause
    exit /b 1
)
echo [1/13] 2000년 완료.
echo.

echo [2/13] 1999년 크롤링 시작...
call run_crawler_foreign.bat 1999
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 1999년 실행 중 오류 발생 - 중단합니다.
    pause
    exit /b 1
)
echo [2/13] 1999년 완료.
echo.

echo [3/13] 1998년 크롤링 시작...
call run_crawler_foreign.bat 1998
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 1998년 실행 중 오류 발생 - 중단합니다.
    pause
    exit /b 1
)
echo [3/13] 1998년 완료.
echo.

echo [4/13] 1997년 크롤링 시작...
call run_crawler_foreign.bat 1997
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 1997년 실행 중 오류 발생 - 중단합니다.
    pause
    exit /b 1
)
echo [4/13] 1997년 완료.
echo.

echo [5/13] 1996년 크롤링 시작...
call run_crawler_foreign.bat 1996
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 1996년 실행 중 오류 발생 - 중단합니다.
    pause
    exit /b 1
)
echo [5/13] 1996년 완료.
echo.

echo [6/13] 1995년 크롤링 시작...
call run_crawler_foreign.bat 1995
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 1995년 실행 중 오류 발생 - 중단합니다.
    pause
    exit /b 1
)
echo [6/13] 1995년 완료.
echo.

echo [7/13] 1994년 크롤링 시작...
call run_crawler_foreign.bat 1994
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 1994년 실행 중 오류 발생 - 중단합니다.
    pause
    exit /b 1
)
echo [7/13] 1994년 완료.
echo.

echo [8/13] 1993년 크롤링 시작...
call run_crawler_foreign.bat 1993
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 1993년 실행 중 오류 발생 - 중단합니다.
    pause
    exit /b 1
)
echo [8/13] 1993년 완료.
echo.

echo [9/13] 1992년 크롤링 시작...
call run_crawler_foreign.bat 1992
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 1992년 실행 중 오류 발생 - 중단합니다.
    pause
    exit /b 1
)
echo [9/13] 1992년 완료.
echo.

echo [10/13] 1991년 크롤링 시작...
call run_crawler_foreign.bat 1991
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 1991년 실행 중 오류 발생 - 중단합니다.
    pause
    exit /b 1
)
echo [10/13] 1991년 완료.
echo.

echo [11/13] 1990년 크롤링 시작...
call run_crawler_foreign.bat 1990
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 1990년 실행 중 오류 발생 - 중단합니다.
    pause
    exit /b 1
)
echo [11/13] 1990년 완료.
echo.

echo [12/13] 1989년 크롤링 시작...
call run_crawler_foreign.bat 1989
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 1989년 실행 중 오류 발생 - 중단합니다.
    pause
    exit /b 1
)
echo [12/13] 1989년 완료.
echo.

echo [13/13] 1988년 크롤링 시작...
call run_crawler_foreign.bat 1988
if %ERRORLEVEL% NEQ 0 (
    echo [오류] 1988년 실행 중 오류 발생 - 중단합니다.
    pause
    exit /b 1
)
echo [13/13] 1988년 완료.
echo.


echo ================================================
echo  모든 연도 크롤링 완료!
echo  60초 후 PC를 종료합니다.
echo ================================================
shutdown /s /t 60
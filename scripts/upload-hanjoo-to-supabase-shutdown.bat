@echo off
chcp 65001 >nul
setlocal

rem SUPABASE_DB_URL / SUPABASE_DB_PASSWORD must be set in the calling PowerShell session.
rem Never write the password into this file.

cd /d "%~dp0.."

if "%SUPABASE_DB_URL%"=="" (
  echo [ERROR] SUPABASE_DB_URL is not set. Run this from the PowerShell window where you set it.
  exit /b 1
)
if "%SUPABASE_DB_PASSWORD%"=="" (
  echo [ERROR] SUPABASE_DB_PASSWORD is not set. Run this from the PowerShell window where you set it.
  exit /b 1
)

set "LOGDIR=D:\SQLiteDB\crawler_logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "LOG=%LOGDIR%\supabase-upload.log"
set PYTHONIOENCODING=utf-8

echo ==== START %date% %time% ====>> "%LOG%"
echo Uploading... log: %LOG%
echo (watch progress in another window: Get-Content "%LOG%" -Wait -Encoding utf8)

python -u scripts\upload-hanjoo-to-supabase.py --skip-existing >> "%LOG%" 2>&1
set RC=%ERRORLEVEL%

echo ==== END %date% %time% exit=%RC% ====>> "%LOG%"
echo Finished with exit code %RC%.

echo PC will shut down in 120 seconds. To cancel: shutdown /a
shutdown /s /t 120 /c "Supabase upload finished (exit=%RC%). Cancel: shutdown /a"

endlocal

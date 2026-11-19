@echo off
setlocal
cd /d "%~dp0"
echo Full refresh checks every existing notice again. Existing files are reused.
call "%~dp0run.bat" --full --pages "" %*
exit /b %ERRORLEVEL%

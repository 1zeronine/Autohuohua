@echo off
set LOGFILE=C:\Users\23514\run.log
echo [%date% %time%] 开始执行 >> "%LOGFILE%"

:: Ensure node is in PATH
set PATH=C:\Program Files\nodejs;%PATH%

:: Run from correct directory
cd /d D:\Autohuohua >> "%LOGFILE%" 2>&1
node D:\Autohuohua\index.js >> "%LOGFILE%" 2>&1

echo [%date% %time%] 执行结束, 退出码=%ERRORLEVEL% >> "%LOGFILE%"

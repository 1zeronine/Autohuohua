@echo off
chcp 65001 >nul
cd /d D:\Autohuohua

:: Log start
echo [%date% %time%] 开始执行 >> run.log 2>&1

:: Ensure node is in PATH
set PATH=C:\Program Files\nodejs;%PATH%

:: Run the script, capture output to log
node index.js >> run.log 2>&1

echo [%date% %time%] 执行结束 >> run.log 2>&1

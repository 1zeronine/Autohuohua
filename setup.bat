@echo off
chcp 65001 >nul
echo ===========================================
echo   抖音自动续火花 - 环境安装
echo ===========================================
echo.
echo [1/2] 安装 Node.js 依赖...
cd /d D:\Autohuohua
call npm install
echo.
echo [2/2] 安装 Chromium 浏览器...
call npx playwright install chromium
echo.
echo ===========================================
echo   安装完成！
echo   接下来请执行以下步骤：
echo   1. 编辑 config.json，设置好友昵称
echo   2. 运行 run.bat 进行首次登录
echo   3. 登录成功后脚本会自动续火花
echo ===========================================
pause

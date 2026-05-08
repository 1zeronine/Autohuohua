# 抖音自动续火花 - 创建/更新定时任务
# 右键 PowerShell → 以管理员身份运行，然后执行本脚本

$taskName = "AutoHuohua"
$scriptPath = "D:\Autohuohua\run.bat"
$hour = 11
$minute = 53
$time = "{0:D2}:{1:D2}" -f $hour, $minute

# 删除旧任务
schtasks /Delete /TN $taskName /F 2>$null

# 创建新任务
schtasks /Create /SC DAILY /TN $taskName /TR "`"$scriptPath`"" /ST $time /F

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  定时任务已创建！" -ForegroundColor Green
Write-Host "  任务名: $taskName" -ForegroundColor Yellow
Write-Host "  执行时间: 每天 $time" -ForegroundColor Yellow
Write-Host "  执行文件: $scriptPath" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "常用命令:" -ForegroundColor Cyan
Write-Host "  查看: schtasks /Query /TN '$taskName'" -ForegroundColor White
Write-Host "  运行: schtasks /Run /TN '$taskName'" -ForegroundColor White
Write-Host "  删除: schtasks /Delete /TN '$taskName' /F" -ForegroundColor White

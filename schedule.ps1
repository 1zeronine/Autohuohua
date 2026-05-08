# 抖音自动续火花 - 修改定时任务执行时间
# 右键 PowerShell 以管理员身份运行，输入: D:\Autohuohua\schedule.ps1

$hour = 16
$minute = 28

$taskName = "AutoHuohua"
$time = "{0:D2}:{1:D2}" -f $hour, $minute
$cmd = 'powershell.exe -ExecutionPolicy Bypass -File "D:\Autohuohua\run.ps1"'

# Delete old task
schtasks /Delete /TN $taskName /F 2>$null

# Create new task
schtasks /Create /SC DAILY /TN $taskName /TR $cmd /ST $time /F

Write-Host "============================================" -ForegroundColor Green
Write-Host "  Task : $taskName" -ForegroundColor Yellow
Write-Host "  Time : $time daily" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Green

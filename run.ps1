$logFile = "$env:USERPROFILE\run.log"
$ts = Get-Date -Format "yyyy/MM/dd HH:mm:ss"
"[$ts] START" | Out-File -FilePath $logFile -Encoding utf8 -Append

$env:Path = "C:\Program Files\nodejs;" + $env:Path

Set-Location D:\Autohuohua

$output = & "C:\Program Files\nodejs\node.exe" "D:\Autohuohua\index.js" 2>&1
$output | Out-File -FilePath $logFile -Encoding utf8 -Append

$ts = Get-Date -Format "yyyy/MM/dd HH:mm:ss"
"[$ts] END (exit=$LASTEXITCODE)" | Out-File -FilePath $logFile -Encoding utf8 -Append

#Requires -Version 5.1
<#
.SYNOPSIS
  [RPA-03] 웹 중지 (배포 패키지 루트에서도, deploy\rpa-03 에서도 동작)
#>
$ErrorActionPreference = "Stop"
# 배포 패키지: 이 스크립트 옆 logs\  /  소스트리: deploy\rpa-03\logs\
$candidates = @(
  (Join-Path $PSScriptRoot "logs\web.pid"),
  (Join-Path $PSScriptRoot "dist\smart-law-ai-web\logs\web.pid")
)
$pidFile = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $pidFile) {
  Write-Host "pid 파일 없음"
  Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host "PORT 3000 PID=$($_.OwningProcess)" }
  exit 0
}

$procId = [int](Get-Content $pidFile | Select-Object -First 1)
if (Get-Process -Id $procId -ErrorAction SilentlyContinue) {
  Stop-Process -Id $procId -Force
  Write-Host "중지: PID $procId"
} else {
  Write-Host "프로세스 없음: PID $procId"
}
Remove-Item $pidFile -Force -ErrorAction SilentlyContinue

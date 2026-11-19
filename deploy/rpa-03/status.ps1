#Requires -Version 5.1
$ErrorActionPreference = "Continue"
$port = 3000
$pidFile = Join-Path $PSScriptRoot "logs\web.pid"
if (-not (Test-Path $pidFile)) {
  $pidFile = Join-Path $PSScriptRoot "dist\smart-law-ai-web\logs\web.pid"
}

if (Test-Path $pidFile) {
  $procId = Get-Content $pidFile | Select-Object -First 1
  $alive = Get-Process -Id $procId -ErrorAction SilentlyContinue
  Write-Host "PID: $procId alive=$([bool]$alive)"
} else {
  Write-Host "PID 파일 없음"
}

try {
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:${port}/api/smart-law-db/status" -TimeoutSec 8
  Write-Host ("DB mode={0} label={1}" -f $r.mode, $r.label)
  if ($r.probe) {
    Write-Host ("probe laws={0} tariff_section={1}" -f $r.probe.laws, $r.probe.tariff_section)
  }
} catch {
  Write-Host "status API 실패: $($_.Exception.Message)"
}

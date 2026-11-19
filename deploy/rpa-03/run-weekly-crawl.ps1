#Requires -Version 5.1
<#
.SYNOPSIS
  주간 크롤러 일괄 실행 (로그인 불필요 항목). 작업 스케줄러·수동 공통.
.DESCRIPTION
  웹이 떠 있어야 합니다. 없으면 run.ps1 을 먼저 기동한 뒤 API 호출합니다.
#>
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

$port = if ($env:PORT) { $env:PORT } else { "3000" }
$base = "http://127.0.0.1:$port"

# 로그인 없이 호출하도록 .env.local 의 AUTH_SECRET 을 작업 토큰으로 전달
$authSecret = $env:AUTH_SECRET
$envFile = Join-Path $Root ".env.local"
if (-not $authSecret -and (Test-Path $envFile)) {
  foreach ($line in Get-Content $envFile -Encoding UTF8) {
    if ($line -match '^\s*AUTH_SECRET\s*=(.*)$') {
      $authSecret = $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
}
if (-not $authSecret) { throw ".env.local 에 AUTH_SECRET 이 없습니다." }
$headers = @{ "x-smart-law-task-token" = $authSecret }

function Test-WebUp {
  try {
    $null = Invoke-RestMethod -Uri "$base/api/smart-law-db/status" -Headers $headers -TimeoutSec 5
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-WebUp)) {
  Write-Host "웹이 꺼져 있어 run.ps1 기동 시도..."
  & (Join-Path $Root "run.ps1")
  $ok = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if (Test-WebUp) { $ok = $true; break }
  }
  if (-not $ok) { throw "웹 기동 실패: $base" }
}

Write-Host "주간 크롤 시작: POST $base/api/crawler-management/weekly"
$res = Invoke-RestMethod -Method Post -Uri "$base/api/crawler-management/weekly" `
  -Headers $headers -ContentType "application/json" -Body "{}" -TimeoutSec 60
$res | ConvertTo-Json -Depth 6
Write-Host ""
Write-Host "배치가 백그라운드에서 순차 실행됩니다. 상태: GET $base/api/crawler-management/weekly"
Write-Host "화면: $base/crawler-management"

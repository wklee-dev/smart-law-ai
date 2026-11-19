# 일반법령 · lawId 없음 — 법령ID 일괄 조회 후 JSON 저장
# npm run api-management:fetch-law-ids
# $env:API_BASE="http://localhost:3001"

param(
  [string]$Base = $(if ($env:API_BASE) { $env:API_BASE } else { "http://localhost:3000" }),
  [int]$DelayMs = 400,
  [int]$Limit = 0
)

$countRes = Invoke-RestMethod -Method GET -Uri "$Base/api/api-management/fetch-law-id-batch"
if (-not $countRes.ok) {
  Write-Error $countRes.error
  exit 1
}
Write-Host "targets (일반법령, lawId empty): $($countRes.count)" -ForegroundColor Cyan
if ($countRes.count -eq 0) { exit 0 }

$body = "{`"save`":true,`"delayMs`":$DelayMs"
if ($Limit -gt 0) { $body += ",`"limit`":$Limit" }
$body += "}"

$r = Invoke-RestMethod -Method POST `
  -Uri "$Base/api/api-management/fetch-law-id-batch" `
  -ContentType "application/json" `
  -Body $body `
  -TimeoutSec 600

$r | ConvertTo-Json -Depth 4
if (-not $r.ok) { exit 1 }
Write-Host "updated=$($r.updated) failed=$($r.failed)" -ForegroundColor Green

# tariff.db -> Supabase tariff_chunks (year + country_code)
#
# === KR 2026 (현재 작업 대상) ===
#   npm run tariff-chunks:ingest-kr-2026
#   npm run tariff-chunks:embed-kr-2026
#
# === 다른 연도·국가 (인자로 지정) ===
#   npm run tariff-chunks:ingest -- -Year 2025 -CountryCode KR
#   npm run tariff-chunks:embed -- -Year 2025 -CountryCode KR
#   npm run tariff-chunks:ingest -- -Year 2024 -CountryCode US
#
# === 환경 변수로 지정 (PowerShell) ===
#   $env:TARIFF_YEAR='2025'; $env:TARIFF_COUNTRY='kr'; npm run tariff-chunks:ingest
#
# country_code: kr/KR/US 등 -> DB에는 대문자(KR) 저장
# 사전: npm run supabase:start && npm run dev
# 포트 3001: $env:TARIFF_API_BASE='http://localhost:3001'

param(
  [string]$Year = $(if ($env:TARIFF_YEAR) { $env:TARIFF_YEAR } else { "2026" }),
  [string]$CountryCode = $(if ($env:TARIFF_COUNTRY) { $env:TARIFF_COUNTRY } else { "KR" }),
  [switch]$EmbedOnly
)

function Resolve-CountryCode([string]$raw) {
  $t = $raw.Trim().ToUpper()
  if ($t.Length -eq 0) { return "KR" }
  return $t
}

$Year = "$Year".Trim()
if ($Year -notmatch '^\d{4}$') {
  Write-Error "Year must be 4 digits (e.g. 2026). Got: $Year"
  exit 1
}

$Country = Resolve-CountryCode $CountryCode
$Base = if ($env:TARIFF_API_BASE) { $env:TARIFF_API_BASE } else { "http://localhost:3000" }
$EmbedLimit = if ($env:TARIFF_EMBED_BATCH_LIMIT) { [int]$env:TARIFF_EMBED_BATCH_LIMIT } elseif ($env:HS_EMBED_BATCH_LIMIT) { [int]$env:HS_EMBED_BATCH_LIMIT } else { 20 }
$DelaySec = if ($env:TARIFF_EMBED_DELAY_SEC) { [int]$env:TARIFF_EMBED_DELAY_SEC } elseif ($env:HS_EMBED_DELAY_SEC) { [int]$env:HS_EMBED_DELAY_SEC } else { 3 }
$QuotaWaitSec = if ($env:TARIFF_EMBED_QUOTA_WAIT_SEC) { [int]$env:TARIFF_EMBED_QUOTA_WAIT_SEC } elseif ($env:HS_EMBED_QUOTA_WAIT_SEC) { [int]$env:HS_EMBED_QUOTA_WAIT_SEC } else { 90 }

Write-Host "Tariff chunks — year=$Year country=$Country (input: $CountryCode) -> $Base" -ForegroundColor Cyan

function Invoke-EmbedBatch {
  $body = "{`"year`":$Year,`"countryCode`":`"$Country`",`"limit`":$EmbedLimit}"
  try {
    return Invoke-RestMethod -Method POST `
      -Uri "$Base/api/tariff-chunks/embed" `
      -ContentType "application/json" `
      -Body $body
  } catch {
    $resp = $_.Exception.Response
    if ($resp -and [int]$resp.StatusCode -eq 429) {
      return @{ ok = $false; status429 = $true; error = $_.Exception.Message }
    }
    throw
  }
}

if (-not $EmbedOnly) {
  Write-Host "1) ingest (replace year=$Year country=$Country)..." -ForegroundColor Cyan
  $ingestBody = "{`"year`":$Year,`"countryCode`":`"$Country`",`"replace`":true}"
  $ingest = Invoke-RestMethod -Method POST `
    -Uri "$Base/api/tariff-chunks/ingest" `
    -ContentType "application/json" `
    -Body $ingestBody
  $ingest | ConvertTo-Json -Depth 6
  if (-not $ingest.ok) { exit 1 }
  if ($ingest.warning) { Write-Host $ingest.warning -ForegroundColor Yellow }
} else {
  Write-Host "1) ingest skipped (-EmbedOnly)" -ForegroundColor DarkGray
}

Write-Host "2) embed loop (limit=$EmbedLimit, delay=${DelaySec}s)..." -ForegroundColor Cyan
$total = 0
$stall = 0
while ($true) {
  $r = Invoke-EmbedBatch
  if ($r.status429) {
    $stall += 1
    Write-Host "  429 quota — ${QuotaWaitSec}s wait ($stall)..." -ForegroundColor Yellow
    Start-Sleep -Seconds $QuotaWaitSec
    if ($stall -ge 30) {
      Write-Host "Resume: npm run tariff-chunks:embed -- -Year $Year -CountryCode $Country" -ForegroundColor Red
      exit 1
    }
    continue
  }
  if (-not $r.ok) {
    $r | ConvertTo-Json
    exit 1
  }
  $stall = 0
  $n = [int]$r.embeddedCount
  $total += $n
  Write-Host "  batch embedded: $n (total $total)"
  if ($n -eq 0) { break }
  Start-Sleep -Seconds $DelaySec
}

Write-Host "Done. Total embedded this run: $total" -ForegroundColor Green
Write-Host "Check: SELECT COUNT(*) FILTER (WHERE embedding IS NOT NULL) done, COUNT(*) all FROM tariff_chunks WHERE year=$Year AND country_code='$Country';"

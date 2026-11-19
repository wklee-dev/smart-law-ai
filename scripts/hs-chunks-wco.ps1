# HS 해설 · WCO · 국문 — ingest + embed (연도 지정)
#
#   npm run hs-chunks:ingest-2017-wco
#   npm run hs-chunks:embed-2017-wco
#   npm run hs-chunks:ingest-wco -- -Year 2012
#   $env:HS_APLY_YEAR='2017'; npm run hs-chunks:embed-wco
#
# 포트가 3001이면: $env:HS_API_BASE="http://localhost:3001"

param(
  [string]$Year = $(if ($env:HS_APLY_YEAR) { $env:HS_APLY_YEAR } else { "2022" }),
  [string]$Division = $(if ($env:HS_DIVISION) { $env:HS_DIVISION } else { "wco" }),
  [string]$LangCode = "kor",
  [switch]$EmbedOnly
)

# ASCII only (avoid Korean in .ps1 — Windows console encoding breaks -match regex)
function Resolve-HsDivision([string]$raw) {
  $t = $raw.Trim().ToUpper()
  if ($t -eq "KR") { return "KR" }
  return "WCO"
}

$DivisionCode = Resolve-HsDivision $Division

$Year = "$Year".Trim()
if ($Year -notmatch '^\d{4}$') {
  Write-Error "Year must be 4 digits (e.g. 2017). Got: $Year"
  exit 1
}

$Base = if ($env:HS_API_BASE) { $env:HS_API_BASE } else { "http://localhost:3000" }
$EmbedLimit = if ($env:HS_EMBED_BATCH_LIMIT) { [int]$env:HS_EMBED_BATCH_LIMIT } else { 20 }
$DelaySec = if ($env:HS_EMBED_DELAY_SEC) { [int]$env:HS_EMBED_DELAY_SEC } else { 3 }
$QuotaWaitSec = if ($env:HS_EMBED_QUOTA_WAIT_SEC) { [int]$env:HS_EMBED_QUOTA_WAIT_SEC } else { 90 }

Write-Host "HS chunks — aply_year=$Year division=$Division -> $DivisionCode lang=$LangCode" -ForegroundColor Cyan

function Invoke-EmbedBatch {
  $body = "{`"aplyYear`":`"$Year`",`"division`":`"$DivisionCode`",`"limit`":$EmbedLimit}"
  try {
    return Invoke-RestMethod -Method POST `
      -Uri "$Base/api/hs-chunks/embed" `
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
  Write-Host "1) ingest (replace)..." -ForegroundColor Cyan
  $ingestBody = "{`"aplyYear`":`"$Year`",`"division`":`"$DivisionCode`",`"langCode`":`"$LangCode`",`"replace`":true}"
  $ingest = Invoke-RestMethod -Method POST `
    -Uri "$Base/api/hs-chunks/ingest" `
    -ContentType "application/json" `
    -Body $ingestBody
  $ingest | ConvertTo-Json -Depth 5
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
    Write-Host "  429 quota — ${QuotaWaitSec}s 대기 후 재시도 ($stall)..." -ForegroundColor Yellow
    Start-Sleep -Seconds $QuotaWaitSec
    if ($stall -ge 30) {
      Write-Host "할당량 대기 한도 초과. 나중에: npm run hs-chunks:embed-${Year}-wco" -ForegroundColor Red
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
if ($total -eq 0 -and $EmbedOnly) {
  Write-Host "임베딩 0건 = 해당 연도·출처에 embedding IS NULL 인 행이 없음 (이미 완료일 수 있음)." -ForegroundColor Yellow
}
Write-Host "Studio: SELECT COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS done, COUNT(*) AS all FROM hs_chunks WHERE aply_year='$Year' AND division='$DivisionCode';"

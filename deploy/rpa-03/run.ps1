#Requires -Version 5.1
<#
.SYNOPSIS
  [RPA-03에서 실행] 배포 패키지 기동 — 빌드 없이 node server.js 만
#>
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

if (-not (Test-Path (Join-Path $Root "server.js"))) {
  throw "server.js 없음. 개발 PC에서 pack.ps1 로 만든 배포 폴더인지 확인하세요."
}

$envFile = Join-Path $Root ".env.local"
if (-not (Test-Path $envFile)) {
  $ex = Join-Path $Root "env.example"
  if (Test-Path $ex) {
    Copy-Item $ex $envFile
    Write-Host ".env.local 생성됨. 비밀번호 입력 후 다시 run.ps1 실행:"
    Write-Host "  notepad $envFile"
    exit 2
  }
  throw ".env.local / env.example 없음"
}

# .env.local → 프로세스 환경변수 (standalone은 dotenv 자동 로드가 제한적일 수 있음)
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $i = $line.IndexOf("=")
  if ($i -lt 1) { return }
  $k = $line.Substring(0, $i).Trim()
  $v = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
  # RPA-03은 C: 드라이브만 사용 — D:\SQLiteDB 등 개발 PC 경로는 C:로 강제
  if ($v -match '^[Dd]:[\\/]') {
    $nv = "C:" + $v.Substring(2)
    Write-Host "경로 보정: $k = $v -> $nv"
    $v = $nv
  }
  Set-Item -Path "Env:$k" -Value $v
}
if ($env:CAS_TARGE -and -not $env:CAS_TARGET) { $env:CAS_TARGET = $env:CAS_TARGE }

$hasPgPass = $env:SMART_LAW_PG_PASSWORD -and ($env:SMART_LAW_PG_PASSWORD -notmatch "비밀번호|여기실제")
$hasUrl = $env:SMART_LAW_DATABASE_URL -and ($env:SMART_LAW_DATABASE_URL -notmatch "비밀번호")
if (-not $hasPgPass -and -not $hasUrl) {
  throw ".env.local 에 SMART_LAW_PG_PASSWORD (권장) 또는 SMART_LAW_DATABASE_URL 을 설정하세요."
}

$port = if ($env:PORT) { $env:PORT } else { "3000" }
$hostName = if ($env:HOSTNAME) { $env:HOSTNAME } else { "0.0.0.0" }
$env:PORT = $port
$env:HOSTNAME = $hostName

# RPA-03 다운로드(첨부) 루트 고정
if (-not $env:SMART_LAW_ATTACH_ROOT) {
  $env:SMART_LAW_ATTACH_ROOT = "C:/SQLiteDB"
}

# 주간 크롤러 폴더 (패키지에 포함된 scripts\crawlers)
$crawlersDir = Join-Path $Root "scripts\crawlers"
if (-not $env:WEEKLY_CRAWLERS_DIR -and (Test-Path $crawlersDir)) {
  $env:WEEKLY_CRAWLERS_DIR = $crawlersDir
}

Write-Host "첨부루트: $($env:SMART_LAW_ATTACH_ROOT)"

# 크롤러 관리 처리현황 엑셀: 배포본 seed → 첨부루트\excel (없을 때만 — 웹에서 진행상황을 기록하므로 덮어쓰지 않음)
$seedExcel = Join-Path $Root "seed\excel"
if (Test-Path $seedExcel) {
  $excelDir = Join-Path $env:SMART_LAW_ATTACH_ROOT "excel"
  New-Item -ItemType Directory -Force -Path $excelDir | Out-Null
  Get-ChildItem $seedExcel -File | ForEach-Object {
    $dst = Join-Path $excelDir $_.Name
    if (-not (Test-Path -LiteralPath $dst)) {
      Copy-Item -LiteralPath $_.FullName -Destination $dst
      Write-Host "엑셀 복사: $dst"
    }
  }
}

$logDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outLog = Join-Path $logDir "web-$stamp.out.log"
$errLog = Join-Path $logDir "web-$stamp.err.log"
$pidFile = Join-Path $logDir "web.pid"

if (Test-Path $pidFile) {
  $old = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) {
    throw "이미 실행 중 (PID $old). 먼저 stop.ps1 실행."
  }
}

$node = (Get-Command node -ErrorAction Stop).Source
Write-Host "기동: http://${hostName}:${port}/"
$proc = Start-Process -FilePath $node -ArgumentList @(
  "--max-old-space-size=8192",
  "server.js"
) -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog

$proc.Id | Set-Content $pidFile -Encoding ascii
Write-Host "PID $($proc.Id) — 로그: $outLog"
Write-Host "확인: Invoke-RestMethod http://127.0.0.1:${port}/api/smart-law-db/status"

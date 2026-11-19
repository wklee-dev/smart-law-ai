#Requires -Version 5.1
<#
.SYNOPSIS
  [개발 PC에서 실행] standalone 빌드 후 RPA-03용 배포 폴더/ZIP 생성
.DESCRIPTION
  결과물: deploy/rpa-03/dist/smart-law-ai-web/
  ZIP:    deploy/rpa-03/dist/smart-law-ai-web-YYYYMMDD-HHmm.zip
  RPA-03에서는 dist 폴더(또는 ZIP 압축 해제)로 가서 run.ps1 만 실행하면 됩니다.
#>
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

Write-Host "=== 1) next build (standalone) ==="
$env:NODE_OPTIONS = "--max-old-space-size=12288"
npm run build

$standalone = Join-Path $Root ".next\standalone"
if (-not (Test-Path $standalone)) {
  throw "standalone 출력 없음. next.config.ts 에 output:'standalone' 확인"
}

# NFT가 이전 배포물을 끌어온 경우 제거 (경로 중첩 방지)
foreach ($junk in @(
  (Join-Path $standalone "deploy"),
  (Join-Path $standalone "scripts\crawlers\deploy")
)) {
  if (Test-Path $junk) {
    Write-Host "standalone 정리: $junk"
    Remove-Item $junk -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$distRoot = Join-Path $PSScriptRoot "dist"
$outDir = Join-Path $distRoot "smart-law-ai-web"
if (Test-Path $outDir) {
  Remove-Item $outDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "=== 2) standalone 복사 ==="
& robocopy $standalone $outDir /E /NFL /NDL /NJH /NJS /nc /ns /np `
  /XD deploy | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "robocopy standalone 실패 (exit $LASTEXITCODE)"
}

# static / public
$staticSrc = Join-Path $Root ".next\static"
$staticDst = Join-Path $outDir ".next\static"
New-Item -ItemType Directory -Force -Path (Split-Path $staticDst) | Out-Null
Copy-Item $staticSrc $staticDst -Recurse -Force

$publicSrc = Join-Path $Root "public"
if (Test-Path $publicSrc) {
  Copy-Item $publicSrc (Join-Path $outDir "public") -Recurse -Force
}

Write-Host "=== 3) 주간 크롤러 스크립트 포함 ==="
$crawlersSrc = Join-Path $Root "scripts\crawlers"
$crawlersDst = Join-Path $outDir "scripts\crawlers"
if (-not (Test-Path $crawlersSrc)) {
  throw "scripts\crawlers 없음 — 주간 크롤 패키징 불가"
}
New-Item -ItemType Directory -Force -Path (Split-Path $crawlersDst) | Out-Null
# __pycache__ / .venv / 로그 제외
& robocopy $crawlersSrc $crawlersDst /E /NFL /NDL /NJH /NJS /nc /ns /np `
  /XD __pycache__ .venv venv logs .git `
  /XF *.pyc *.log | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "robocopy scripts\crawlers 실패 (exit $LASTEXITCODE)"
}
Write-Host "  crawlers 복사 완료 → scripts\crawlers"

# RPA-03은 C: 드라이브만 사용 — 크롤러 설정·코드의 D:\SQLiteDB → C:\SQLiteDB (바이트 보존: latin1 1:1)
$latin1 = [System.Text.Encoding]::GetEncoding(28591)
$fixed = 0
Get-ChildItem $crawlersDst -Recurse -File -Include *.py, *.ini, *.json, *.bat, *.cmd, *.ps1, *.cfg, *.env, *.txt, *.toml, *.yaml, *.yml, env.example |
  ForEach-Object {
    $text = [System.IO.File]::ReadAllText($_.FullName, $latin1)
    $new = [regex]::Replace($text, '(?i)\bD:(\\\\|\\|/)SQLiteDB', 'C:$1SQLiteDB')
    if ($new -ne $text) {
      [System.IO.File]::WriteAllText($_.FullName, $new, $latin1)
      $fixed++
    }
  }
Write-Host "  crawlers D:\SQLiteDB → C:\SQLiteDB 보정: $fixed 파일"

# 크롤러 관리 처리현황 엑셀 — RPA-03 최초 기동 시 run.ps1 이 C:\SQLiteDB\excel 로 복사
$statusXlsx = Join-Path "D:\Manus" "법령정보및관세율,품목분류사례 처리현황.xlsx"
if (Test-Path -LiteralPath $statusXlsx) {
  $seedDir = Join-Path $outDir "seed\excel"
  New-Item -ItemType Directory -Force -Path $seedDir | Out-Null
  Copy-Item -LiteralPath $statusXlsx -Destination $seedDir -Force
  Write-Host "  처리현황 엑셀 포함 → seed\excel"
} else {
  Write-Warning "처리현황 엑셀 없음 (크롤러 관리 화면용): $statusXlsx"
}

Write-Host "=== 4) 실행 스크립트·env 예시 포함 ==="
foreach ($f in @(
  "run.ps1", "stop.ps1", "status.ps1",
  "run-weekly-crawl.ps1", "register-weekly-task.ps1", "unregister-weekly-task.ps1",
  "start.bat", "stop.bat", "status.bat"
)) {
  Copy-Item (Join-Path $PSScriptRoot $f) (Join-Path $outDir $f) -Force
}
Copy-Item (Join-Path $PSScriptRoot "env.rpa03.example") (Join-Path $outDir "env.example") -Force

# README for operators
@"
# smart-law-ai 웹 (RPA-03 실행용)

## 최초 1회
1. 이 폴더 전체를 RPA-03 예: ``C:\smart-law-ai-web`` 에 복사
2. ``copy env.example .env.local``
3. ``notepad .env.local`` → SMART_LAW_PG_PASSWORD 만 입력
4. Node.js LTS, Python3 (주간 크롤용) 설치
5. 크롤러용 SQLite: ``C:\SQLiteDB\smart_law_ai.db`` 준비
6. (선택) 매주 토요일 04:00 자동 크롤 등록:
   ``powershell -ExecutionPolicy Bypass -File .\register-weekly-task.ps1``

## 실행 / 중지 / 상태 (더블클릭)
- 실행: ``start.bat``
- 중지: ``stop.bat``
- 상태: ``status.bat``

## 주간 크롤 (수동)
``````powershell
powershell -ExecutionPolicy Bypass -File .\run-weekly-crawl.ps1
``````
화면: http://127.0.0.1:3000/crawler-management

접속: http://127.0.0.1:3000
"@ | Set-Content (Join-Path $outDir "README.txt") -Encoding UTF8

Write-Host "=== 5) ZIP ==="
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$zip = Join-Path $distRoot "smart-law-ai-web-$stamp.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $outDir -DestinationPath $zip -CompressionLevel Optimal

Write-Host ""
Write-Host "완료."
Write-Host "  폴더: $outDir"
Write-Host "  ZIP : $zip"
Write-Host "RPA-03에 ZIP 또는 폴더를 복사한 뒤 start.bat 을 실행하세요 (중지: stop.bat)."

#Requires -Version 5.1
<#
.SYNOPSIS
  [RPA-03] 매주 토요일 자동 주간 크롤 — Windows 작업 스케줄러 등록
.DESCRIPTION
  기본: 토요일 04:00 에 run-weekly-crawl.ps1 실행.
  관리자 PowerShell 에서 실행 권장.
#>
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Runner = Join-Path $Root "run-weekly-crawl.ps1"
$LogDir = Join-Path $Root "logs"
$LogFile = Join-Path $LogDir "weekly-crawl-task.log"
$TaskName = "SmartLawAI_WeeklyCrawl_Saturday"
$TaskDesc = "smart-law-ai 주간 크롤 (매주 토요일 04:00)"

if (-not (Test-Path $Runner)) {
  throw "run-weekly-crawl.ps1 없음: $Runner"
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$day = if ($env:WEEKLY_CRAWL_DAY) { $env:WEEKLY_CRAWL_DAY } else { "Saturday" }
$at = if ($env:WEEKLY_CRAWL_AT) { $env:WEEKLY_CRAWL_AT } else { "04:00AM" }

$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $day -At $at
$Arg = "-NoProfile -ExecutionPolicy Bypass -File `"$Runner`" >> `"$LogFile`" 2>&1"
$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument $Arg `
  -WorkingDirectory $Root

$Settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 12) `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable `
  -WakeToRun `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "기존 작업 제거: $TaskName"
}

$registered = $false
foreach ($spec in @(
  @{ LogonType = "S4U"; RunLevel = "Highest" },
  @{ LogonType = "S4U"; RunLevel = "Limited" },
  @{ LogonType = "Interactive"; RunLevel = "Limited" }
)) {
  try {
    $Principal = New-ScheduledTaskPrincipal `
      -UserId $UserId `
      -LogonType $spec.LogonType `
      -RunLevel $spec.RunLevel
    Register-ScheduledTask `
      -TaskName $TaskName `
      -Trigger $Trigger `
      -Action $Action `
      -Settings $Settings `
      -Principal $Principal `
      -Description $TaskDesc | Out-Null
    $registered = $true
    Write-Host "등록 완료 LogonType=$($spec.LogonType) RunLevel=$($spec.RunLevel)"
    break
  } catch {
    Write-Host "재시도 ($($spec.LogonType)/$($spec.RunLevel))..."
  }
}

if (-not $registered) {
  throw "작업 등록 실패. 관리자 PowerShell 에서 다시 실행하세요."
}

Write-Host ""
Write-Host "작업 이름 : $TaskName"
Write-Host "일정     : 매주 $day $at"
Write-Host "스크립트 : $Runner"
Write-Host "로그     : $LogFile"
Write-Host ""
Write-Host "즉시 시험: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "또는:     powershell -ExecutionPolicy Bypass -File .\run-weekly-crawl.ps1"

# Register Monday-dawn weekly crawl in Windows Task Scheduler.
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BatchFile = Join-Path $ScriptDir 'run_weekly.bat'
$LogDir    = Join-Path $ScriptDir 'logs'
$LogFile   = Join-Path $LogDir 'weekly_task.log'
$TaskName  = 'ForeignHSClass_Weekly'
$TaskDesc  = 'Foreign HS classification cases - crawl last ISO week every Monday 04:00'

if (-not (Test-Path $BatchFile)) {
    throw "run_weekly.bat not found: $BatchFile"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '04:00AM'

$Arg = "/c `"$BatchFile`" >> `"$LogFile`" 2>&1"
$Action = New-ScheduledTaskAction `
    -Execute 'cmd.exe' `
    -Argument $Arg `
    -WorkingDirectory $ScriptDir

$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 6) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -WakeToRun `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Existing task removed: $TaskName"
}

$registered = $false
foreach ($spec in @(
    @{ LogonType = 'S4U'; RunLevel = 'Highest' },
    @{ LogonType = 'S4U'; RunLevel = 'Limited' },
    @{ LogonType = 'Interactive'; RunLevel = 'Limited' }
)) {
    try {
        $Principal = New-ScheduledTaskPrincipal `
            -UserId $UserId `
            -LogonType $spec.LogonType `
            -RunLevel $spec.RunLevel
        Register-ScheduledTask `
            -TaskName    $TaskName `
            -Trigger     $Trigger `
            -Action      $Action `
            -Settings    $Settings `
            -Principal   $Principal `
            -Description $TaskDesc | Out-Null
        $registered = $true
        Write-Host "Registered with LogonType=$($spec.LogonType) RunLevel=$($spec.RunLevel)"
        break
    } catch {
        Write-Host "Retry next principal ($($spec.LogonType)/$($spec.RunLevel)) ..."
    }
}

if (-not $registered) {
    throw "Task registration failed. Run register_weekly_task.bat as Administrator."
}

Write-Host ""
Write-Host "Task Scheduler registration complete."
Write-Host "  Task name : $TaskName"
Write-Host "  Schedule  : Every Monday at 04:00 AM"
Write-Host "  Script    : $BatchFile"
Write-Host "  Log file  : $LogFile"
Write-Host ""
Write-Host "Manual run:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  or double-click run_weekly.bat"

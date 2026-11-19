#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$TaskName = "SmartLawAI_WeeklyCrawl_Saturday"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "제거됨: $TaskName"
} else {
  Write-Host "없음: $TaskName"
}

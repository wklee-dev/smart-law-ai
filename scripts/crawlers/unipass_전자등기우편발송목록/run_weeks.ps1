<#
Usage:
  .\run_weeks.ps1 -Year 2026 -StartWeek 23 -EndWeek 30

Runs one Python process so UNI-PASS is logged in once for the whole range.
Do not call the crawler in a PowerShell foreach loop, because that creates a
new browser session and a new login for every week.
#>
param(
    [Parameter(Mandatory = $true)][int]$Year,
    [Parameter(Mandatory = $true)][ValidateRange(1, 53)][int]$StartWeek,
    [Parameter(Mandatory = $true)][ValidateRange(1, 53)][int]$EndWeek
)

$ErrorActionPreference = 'Stop'
if ($EndWeek -lt $StartWeek) {
    throw 'EndWeek must be greater than or equal to StartWeek.'
}

$scriptPath = Join-Path $PSScriptRoot 'unipass_post_crawler.py'
if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Crawler script not found: $scriptPath"
}

Write-Host "Starting one logged-in session: $Year week $StartWeek through $EndWeek"
& python $scriptPath --year $Year --week $StartWeek --week-end $EndWeek
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Host "[STOPPED] The crawler exited with code $exitCode. It was not restarted automatically."
    exit $exitCode
}

Write-Host '[DONE] All requested weeks completed in one login session.'
exit 0

# Portable Python + package installer for PCs without Python.
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PyDir = Join-Path $Root 'python'
$PyVer = '3.12.10'
$ZipUrl = "https://www.python.org/ftp/python/$PyVer/python-$PyVer-embed-amd64.zip"
$ZipPath = Join-Path $env:TEMP "python-$PyVer-embed-amd64.zip"
$GetPipUrl = 'https://bootstrap.pypa.io/get-pip.py'
$GetPipPath = Join-Path $env:TEMP 'get-pip.py'
$PythonExe = Join-Path $PyDir 'python.exe'
$ReqFile = Join-Path $Root 'requirements.txt'

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Download-File {
    param([string]$Url, [string]$OutFile)
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        & curl.exe -L --fail --retry 3 --connect-timeout 30 -o $OutFile $Url
        if ($LASTEXITCODE -ne 0) {
            throw "Download failed: $Url"
        }
    } else {
        Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
    }
}

function Write-PthFile {
    $pth = Get-ChildItem -Path $PyDir -Filter 'python*._pth' | Select-Object -First 1
    if (-not $pth) {
        throw "python*._pth not found in $PyDir"
    }
    $orig = Get-Content -Path $pth.FullName
    $zipLine = ($orig | Where-Object { $_ -match '\.zip\s*$' } | Select-Object -First 1)
    if (-not $zipLine) { $zipLine = 'python312.zip' }
    @(
        $zipLine.Trim()
        '.'
        'Lib\site-packages'
        'import site'
    ) | Set-Content -Path $pth.FullName -Encoding ASCII
}

if (-not (Test-Path $PythonExe)) {
    Write-Host "[1/4] Downloading portable Python $PyVer ..."
    Download-File -Url $ZipUrl -OutFile $ZipPath
    New-Item -ItemType Directory -Force -Path $PyDir | Out-Null
    Expand-Archive -Path $ZipPath -DestinationPath $PyDir -Force
    Write-PthFile

    Write-Host "[2/4] Installing pip ..."
    Download-File -Url $GetPipUrl -OutFile $GetPipPath
    & $PythonExe $GetPipPath --no-warn-script-location
    if ($LASTEXITCODE -ne 0) {
        throw "get-pip.py failed (exit $LASTEXITCODE)"
    }
} else {
    Write-Host "[1/4] Portable Python already exists: $PythonExe"
    Write-Host "[2/4] Skip pip bootstrap"
    $pth = Get-ChildItem -Path $PyDir -Filter 'python*._pth' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pth) { Write-PthFile }
}

Write-Host "[3/4] Installing packages from requirements.txt ..."
if (-not (Test-Path $ReqFile)) {
    throw "requirements.txt not found: $ReqFile"
}
& $PythonExe -m pip install --no-warn-script-location -r $ReqFile
if ($LASTEXITCODE -ne 0) {
    throw "pip install failed (exit $LASTEXITCODE)"
}

Write-Host "[4/4] Creating folders ..."
New-Item -ItemType Directory -Force -Path 'D:\SQLiteDB' | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'logs') | Out-Null

Write-Host ""
Write-Host "Install complete."
& $PythonExe --version
Write-Host "Python path: $PythonExe"
Write-Host "DB folder  : D:\SQLiteDB"

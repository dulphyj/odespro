param(
    [string]$BackendUrl = "http://host.docker.internal:8000",
    [switch]$SkipNaps2Check
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentDir = Join-Path -Path $ScriptDir -ChildPath "..\scanner-agent"
$AgentDir = Resolve-Path $AgentDir

Write-Host "=== Scanner Agent - Windows Native Runner ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check .NET 8 SDK
Write-Host "[1/4] Checking .NET 8 SDK..." -ForegroundColor Yellow
$dotnetVersion = & dotnet --version 2>$null
if (-not $dotnetVersion -or $dotnetVersion -notmatch "^8") {
    Write-Host "ERROR: .NET 8 SDK is required." -ForegroundColor Red
    Write-Host "Download from: https://dotnet.microsoft.com/download/dotnet/8.0"
    exit 1
}
Write-Host "  .NET $dotnetVersion found" -ForegroundColor Green

# Step 2: Check NAPS2
if (-not $SkipNaps2Check) {
    Write-Host "[2/4] Checking NAPS2 installation..." -ForegroundColor Yellow
    $naps2Paths = @(
        "${env:ProgramFiles}\NAPS2\NAPS2.Console.exe",
        "${env:ProgramFiles(x86)}\NAPS2\NAPS2.Console.exe",
        "${env:LOCALAPPDATA}\NAPS2\NAPS2.Console.exe"
    )
    $naps2Found = $false
    foreach ($p in $naps2Paths) {
        if (Test-Path $p) {
            $naps2Found = $true
            Write-Host "  NAPS2 found at: $p" -ForegroundColor Green
            break
        }
    }
    if (-not $naps2Found) {
        Write-Host "  NAPS2 not found." -ForegroundColor Yellow
        Write-Host "  The scanner agent will use simulated scanning (stub mode)." -ForegroundColor Yellow
        Write-Host "  For real scanning, install NAPS2 from: https://www.naps2.com/download" -ForegroundColor Yellow
        Write-Host "  (portable version is enough - no installation needed)" -ForegroundColor Yellow
        Write-Host ""
        $choice = Read-Host "  Download NAPS2 portable now? (Y/N, default: N)"
        if ($choice -eq "Y" -or $choice -eq "y") {
            Write-Host "  Downloading NAPS2 portable..." -ForegroundColor Yellow
            $naps2Dir = Join-Path -Path $env:TEMP -ChildPath "naps2-portable"
            New-Item -ItemType Directory -Path $naps2Dir -Force | Out-Null
            $zipPath = Join-Path -Path $naps2Dir -ChildPath "naps2.zip"
            try {
                Invoke-WebRequest -Uri "https://github.com/cyanfish/naps2/releases/download/7.5.2/NAPS2.7.5.2.portable.zip" -OutFile $zipPath -UseBasicParsing
                Expand-Archive -Path $zipPath -DestinationPath $naps2Dir -Force
                Write-Host "  NAPS2 portable extracted to: $naps2Dir" -ForegroundColor Green
                # Add to PATH for this session
                $env:Path = "$naps2Dir;$env:Path"
            }
            catch {
                Write-Host "  Failed to download NAPS2: $_" -ForegroundColor Red
                Write-Host "  Continuing with stub mode. Manual download: https://www.naps2.com/download" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "  Continuing with stub mode..." -ForegroundColor Yellow
        }
    }
}
else {
    Write-Host "[2/4] Skipping NAPS2 check (-SkipNaps2Check)" -ForegroundColor Yellow
}

# Step 3: Build scanner-agent
Write-Host "[3/4] Building scanner-agent..." -ForegroundColor Yellow
Set-Location -Path $AgentDir
dotnet build -c Release --nologo -v q 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    dotnet build -c Release 2>&1
    exit 1
}
Write-Host "  Build succeeded" -ForegroundColor Green

# Step 4: Run scanner-agent
Write-Host "[4/4] Starting scanner-agent..." -ForegroundColor Yellow
Write-Host "  Backend URL: $BackendUrl" -ForegroundColor Gray
Write-Host "  Provider: naps2 (auto-detect via WMI + NAPS2 CLI)" -ForegroundColor Gray
Write-Host ""
Write-Host "=== Scanner Agent Running ===" -ForegroundColor Cyan
Write-Host "Access it at: http://localhost:5000" -ForegroundColor White
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

$env:ASPNETCORE_URLS = "http://0.0.0.0:5000"
$env:BACKEND_URL = $BackendUrl
$env:SCANNER_PROVIDER = "naps2"

Set-Location -Path $AgentDir
dotnet run --project ScannerAgent.csproj --no-build -c Release

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Scanner agent exited with code $LASTEXITCODE" -ForegroundColor Red
    Write-Host "Try running in Development mode:" -ForegroundColor Yellow
    Write-Host "  dotnet run --project ScannerAgent.csproj -c Debug" -ForegroundColor Yellow
    exit $LASTEXITCODE
}

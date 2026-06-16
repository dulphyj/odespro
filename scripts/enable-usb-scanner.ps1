param(
    [switch]$AutoAttach,
    [string]$ScannerBusId = "",
    [switch]$RestartDocker
)

$ErrorActionPreference = "Continue"

Write-Host "=== Odespro - USB Scanner Passthrough Setup ===" -ForegroundColor Cyan
Write-Host "Enables your USB scanner inside the Docker container" -ForegroundColor White
Write-Host ""

# Step 1: Check Docker Desktop
Write-Host "[1/4] Checking Docker Desktop..." -ForegroundColor Yellow
try {
    $dockerInfo = & docker info --format "{{.OSType}}" 2>&1 | Out-String
    if ($dockerInfo.Trim() -ne "linux") {
        Write-Host "  Docker Desktop is using Windows containers. Switch to Linux containers." -ForegroundColor Red
        Write-Host "  Right-click Docker tray icon -> 'Switch to Linux containers...'" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  Docker Desktop OK (Linux containers)" -ForegroundColor Green
}
catch {
    Write-Host "  Docker Desktop not running or not installed." -ForegroundColor Red
    Write-Host "  Start Docker Desktop and try again." -ForegroundColor Yellow
    exit 1
}

# Step 2: Check / install usbipd-win
Write-Host "[2/4] Checking usbipd-win..." -ForegroundColor Yellow
$usbipd = Get-Command usbipd -ErrorAction SilentlyContinue
if (-not $usbipd) {
    Write-Host "  usbipd-win not found. Installing..." -ForegroundColor Yellow
    try {
        winget install --exact --silent usbipd --accept-package-agreements 2>&1 | Out-Null
        Write-Host "  usbipd-win installed. A reboot may be required." -ForegroundColor Green
        Write-Host "  After reboot, run this script again." -ForegroundColor Yellow
        exit 0
    }
    catch {
        Write-Host "  Auto-install failed. Install manually:" -ForegroundColor Red
        Write-Host "    winget install usbipd" -ForegroundColor White
        Write-Host "    Or download from: https://github.com/dorssel/usbipd-win/releases" -ForegroundColor White
        exit 1
    }
}
Write-Host "  usbipd-win found" -ForegroundColor Green

# Step 3: List & attach scanner USB device
Write-Host "[3/4] Listing USB devices..." -ForegroundColor Yellow

$devices = & usbipd list 2>&1 | Out-String
Write-Host $devices

$scannerFound = $false
$lines = $devices -split "`n"
foreach ($line in $lines) {
    if ($line -match "(\S+)\s+.*(?:Scanner|ScanJet|HP|imaging|imaging device|usb scanner).*" -or
        ($ScannerBusId -and $line -match [regex]::Escape($ScannerBusId))) {
        $busId = $matches[1].Trim()
        $scannerFound = $true

        if ($line -match "Not shared|No attached") {
            Write-Host "  Binding scanner at bus ID: $busId" -ForegroundColor Yellow
            try {
                & usbipd bind --busid $busId 2>&1 | Out-String
                & usbipd attach --wsl --busid $busId --auto-attach 2>&1 | Out-String
                Write-Host "  Scanner attached to WSL successfully!" -ForegroundColor Green
            }
            catch {
                Write-Host "  Failed to attach scanner. Try:" -ForegroundColor Red
                Write-Host "    usbipd bind --busid $busId" -ForegroundColor White
                Write-Host "    usbipd attach --wsl --busid $busId --auto-attach" -ForegroundColor White
            }
        }
        else {
            Write-Host "  Scanner already attached ($busId)" -ForegroundColor Green
        }
    }
}

if (-not $scannerFound) {
    Write-Host "  No scanner found in USB devices list." -ForegroundColor Yellow
    Write-Host "  Make sure your scanner is connected via USB." -ForegroundColor Yellow
    Write-Host "  If it's a different bus ID, run:" -ForegroundColor Yellow
    Write-Host "    .\scripts\enable-usb-scanner.ps1 -ScannerBusId <BUSID>" -ForegroundColor White
    Write-Host ""
    Write-Host "  To find the bus ID:" -ForegroundColor Yellow
    Write-Host "    usbipd list" -ForegroundColor White
}

# Step 4: Restart scanner-agent container
if ($RestartDocker -or $AutoAttach) {
    Write-Host "[4/4] Restarting scanner-agent container..." -ForegroundColor Yellow
    try {
        & docker compose -f "$PSScriptRoot\..\docker-compose.yml" restart scanner-agent 2>&1 | Out-String
        Write-Host "  Container restarted" -ForegroundColor Green

        Start-Sleep -Seconds 3
        $logs = & docker logs odespro-scanner --tail 20 2>&1 | Out-String
        if ($logs -match "SANE scanner detection") {
            Write-Host "  Scanner-agent running with SANE provider" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "  Could not restart container. Run manually:" -ForegroundColor Yellow
        Write-Host "    docker compose restart scanner-agent" -ForegroundColor White
    }
}
else {
    Write-Host ""
    Write-Host "[4/4] Restart container to apply changes:" -ForegroundColor Yellow
    Write-Host "    docker compose restart scanner-agent" -ForegroundColor White
}

Write-Host ""
Write-Host "=== Verification ===" -ForegroundColor Cyan
Write-Host "Check scanner detection:" -ForegroundColor White
Write-Host "  docker logs odespro-scanner --tail 50" -ForegroundColor Gray
Write-Host "  curl http://localhost:5000/api/scanners" -ForegroundColor Gray
Write-Host ""
Write-Host "WSL integration (enable in Docker Desktop settings):" -ForegroundColor Yellow
Write-Host "  Settings -> Resources -> WSL Integration -> Enable Ubuntu" -ForegroundColor Gray
Write-Host ""
Write-Host "If scanner still not detected, enter container:" -ForegroundColor Yellow
Write-Host "  docker exec -it odespro-scanner bash" -ForegroundColor Gray
Write-Host "  scanimage -L  # List SANE devices" -ForegroundColor Gray
Write-Host "  ls /dev/bus/usb/  # Check USB devices" -ForegroundColor Gray
Write-Host ""
Write-Host "To persist USB attach across reboots:" -ForegroundColor Yellow
Write-Host "  usbipd bind --busid <BUSID>" -ForegroundColor Gray
Write-Host "  usbipd attach --wsl --busid <BUSID> --auto-attach" -ForegroundColor Gray

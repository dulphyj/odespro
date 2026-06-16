param(
    [switch]$ForceMcr
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentDir = Resolve-Path "$ScriptDir\..\scanner-agent"

Write-Host "=== Build Scanner Agent Docker Image ===" -ForegroundColor Cyan

if ($ForceMcr) {
    Write-Host "Using MCR-based Dockerfile" -ForegroundColor Yellow
    docker compose -f "$ScriptDir\..\docker-compose.yml" build scanner-agent 2>&1
    exit $LASTEXITCODE
}

Write-Host "Step 1: Publishing self-contained Linux x64 binary..." -ForegroundColor Yellow
dotnet publish "$AgentDir\ScannerAgent.csproj" `
    -c Release `
    -r linux-x64 `
    --self-contained true `
    -o "$AgentDir\publish\linux-x64" `
    --nologo 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: dotnet publish failed" -ForegroundColor Red
    exit 1
}
Write-Host "  Binary published to scanner-agent\publish\linux-x64\" -ForegroundColor Green

Write-Host "Step 2: Building Docker image..." -ForegroundColor Yellow
docker build -t odespro-scanner:latest `
    -f "$AgentDir\Dockerfile.selfcontained" `
    "$AgentDir" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker build failed" -ForegroundColor Red
    exit 1
}
Write-Host "  Docker image built: odespro-scanner:latest" -ForegroundColor Green

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Run with: docker compose up -d scanner-agent" -ForegroundColor White
Write-Host ""
Write-Host "To use the self-contained image, update docker-compose.yml:" -ForegroundColor Yellow
Write-Host "  scanner-agent:" -ForegroundColor Gray
Write-Host "    build:" -ForegroundColor Gray
Write-Host "      dockerfile: Dockerfile.selfcontained  # <-- add this" -ForegroundColor Gray

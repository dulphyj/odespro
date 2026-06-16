# Odespro - Setup Script for Windows
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Odespro - Gestión Documental Next Gen" -ForegroundColor Cyan
Write-Host "  Setup Script for Windows" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check Docker
try {
    $dockerVersion = docker --version
    Write-Host "  ✓ Docker: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Docker not found. Please install Docker Desktop for Windows." -ForegroundColor Red
    exit 1
}

# Check Docker Compose
try {
    $composeVersion = docker compose version
    Write-Host "  ✓ Docker Compose: $composeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Docker Compose not found." -ForegroundColor Red
    exit 1
}

Write-Host "All prerequisites satisfied!" -ForegroundColor Green
Write-Host ""

# Create .env from example if not exists
if (-not (Test-Path -LiteralPath ".env")) {
    Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item -LiteralPath ".env.example" -Destination ".env"
    Write-Host "  ✓ .env created" -ForegroundColor Green
} else {
    Write-Host "  ✓ .env already exists" -ForegroundColor Green
}

# Create required directories
Write-Host "Creating required directories..." -ForegroundColor Yellow
$dirs = @("data\postgres", "data\minio", "data\rabbitmq", "logs")
foreach ($dir in $dirs) {
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  ✓ Created $dir" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Starting services with Docker Compose..." -ForegroundColor Yellow
docker compose up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Odespro is starting up!" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Frontend:       http://localhost:3000" -ForegroundColor White
    Write-Host "  Backend API:    http://localhost:8000" -ForegroundColor White
    Write-Host "  API Docs:       http://localhost:8000/docs" -ForegroundColor White
    Write-Host "  MinIO Console:  http://localhost:9001" -ForegroundColor White
    Write-Host "  Scanner Agent:  http://localhost:5000" -ForegroundColor White
    Write-Host "  OCR Service:    http://localhost:8001" -ForegroundColor White
    Write-Host ""
    Write-Host "  Default login:" -ForegroundColor Yellow
    Write-Host "  Username: admin" -ForegroundColor White
    Write-Host "  Password: admin123" -ForegroundColor White
    Write-Host ""
    Write-Host "  Wait a few minutes for all services to be ready." -ForegroundColor Yellow
    Write-Host "  Run 'docker compose logs -f' to watch progress." -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
} else {
    Write-Host "Error starting services. Check docker compose logs for details." -ForegroundColor Red
    exit 1
}

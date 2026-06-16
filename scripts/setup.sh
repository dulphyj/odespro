#!/bin/bash
# Odespro - Setup Script for Linux
set -e

echo "========================================"
echo "  Odespro - Gestión Documental Next Gen"
echo "  Setup Script for Linux"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check Docker
if command -v docker &> /dev/null; then
    echo -e "  ${GREEN}✓ Docker: $(docker --version)${NC}"
else
    echo -e "  ${RED}✗ Docker not found. Please install Docker first.${NC}"
    exit 1
fi

# Check Docker Compose
if docker compose version &> /dev/null; then
    echo -e "  ${GREEN}✓ Docker Compose: $(docker compose version)${NC}"
else
    echo -e "  ${RED}✗ Docker Compose not found.${NC}"
    exit 1
fi

echo -e "${GREEN}All prerequisites satisfied!${NC}"
echo ""

# Create .env from example if not exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env from .env.example...${NC}"
    cp .env.example .env
    echo -e "  ${GREEN}✓ .env created${NC}"
else
    echo -e "  ${GREEN}✓ .env already exists${NC}"
fi

# Create required directories
echo -e "${YELLOW}Creating required directories...${NC}"
mkdir -p data/postgres data/minio data/rabbitmq logs
echo -e "  ${GREEN}✓ Directories created${NC}"

echo ""
echo -e "${YELLOW}Starting services with Docker Compose...${NC}"
docker compose up -d

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  Odespro is starting up!${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo -e "  Frontend:       http://localhost:3000"
    echo -e "  Backend API:    http://localhost:8000"
    echo -e "  API Docs:       http://localhost:8000/docs"
    echo -e "  MinIO Console:  http://localhost:9001"
    echo -e "  Scanner Agent:  http://localhost:5000"
    echo -e "  OCR Service:    http://localhost:8001"
    echo ""
    echo -e "${YELLOW}  Default login:${NC}"
    echo -e "  Username: admin"
    echo -e "  Password: admin123"
    echo ""
    echo -e "${YELLOW}  Wait a few minutes for all services to be ready.${NC}"
    echo -e "${YELLOW}  Run 'docker compose logs -f' to watch progress.${NC}"
    echo -e "${CYAN}========================================${NC}"
else
    echo -e "${RED}Error starting services. Check docker compose logs for details.${NC}"
    exit 1
fi

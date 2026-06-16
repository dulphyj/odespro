# Odespro - Sistema de Gestión Documental Next Gen 2026

Plataforma documental moderna open source para digitalización, OCR, clasificación y gestión documental.

## Arquitectura

```
Frontend (NextJS 15) ───→ Backend API (FastAPI) ───→ PostgreSQL 17
                              │                            │
                              ├──→ MinIO (Almacenamiento)  └──→ pgvector
                              ├──→ Scanner Agent (.NET 8)
                              └──→ OCR Service (PaddleOCR)
```

## Componentes

| Componente | Tecnología | Puerto |
|------------|-----------|--------|
| Frontend | NextJS 15 + React 19 + TypeScript | 3000 |
| Backend API | FastAPI + Python 3.12 + SQLAlchemy 2 | 8000 |
| PostgreSQL | PostgreSQL 17 + pgvector | 5432 |
| MinIO | MinIO (S3-compatible storage) | 9000/9001 |
| Scanner Agent | .NET 8 + ASP.NET Core + NAPS2 SDK | 5000 |
| OCR Service | PaddleOCR + FastAPI | 8001 |
| Nginx | Reverse proxy | 80 |

## Requisitos

- Docker 24+
- Docker Compose v2+
- Escáner TWAIN/WIA/ESCL (opcional)

## Inicio Rápido

### Linux/Mac

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### Windows PowerShell

```powershell
.\scripts\setup.ps1
```

### Manual

```bash
cp .env.example .env
docker compose up -d
```

### Acceso

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:3000 |
| API Docs | http://localhost:8000/docs |
| MinIO Console | http://localhost:9001 |

**Credenciales por defecto:**
- Usuario: `admin`
- Contraseña: `admin123`

## Funcionalidades MVP

- [x] Autenticación JWT con roles
- [x] Gestión de usuarios y roles
- [x] Estructura de carpetas jerárquica
- [x] Carga de documentos (drag & drop)
- [x] Escaneo desde escáner físico (NAPS2 SDK)
- [x] Vista previa de escaneo con rotación y reordenación
- [x] OCR automático (PaddleOCR español)
- [x] Clasificación documental automática (reglas locales)
- [x] Búsqueda por texto y similitud (pgvector)
- [x] Versionado documental
- [x] Almacenamiento S3 (MinIO)
- [x] Auditoría de acciones
- [x] Reportes (CSV/Excel/PDF)
- [x] API REST completa
- [x] Interfaz responsive (TailwindCSS + Shadcn UI)

## Estructura del Proyecto

```
project-root/
├── backend/          # FastAPI + SQLAlchemy + Alembic
├── frontend/         # NextJS 15 + Shadcn UI
├── scanner-agent/    # .NET 8 + NAPS2 SDK
├── ocr-service/      # PaddleOCR + FastAPI
├── database/         # DDL y seeds
├── infra/            # Nginx config
├── scripts/          # Setup y backup
├── docker-compose.yml
└── .env.example
```

## API Endpoints

### Autenticación
- `POST /api/v1/auth/login` - Iniciar sesión
- `GET /api/v1/auth/me` - Perfil actual
- `POST /api/v1/auth/change-password` - Cambiar contraseña

### Documentos
- `GET /api/v1/documents` - Listar documentos
- `POST /api/v1/documents` - Crear/subir documento
- `GET /api/v1/documents/{id}` - Detalle
- `GET /api/v1/documents/{id}/download` - Descargar
- `POST /api/v1/documents/{id}/versions` - Nueva versión

### Escaneo
- `GET /api/v1/scanner/devices` - Escáneres disponibles
- `POST /api/v1/scanner/scan` - Escanear
- `POST /api/v1/scanner/scan/pdf` - Escanear a PDF

### OCR
- `POST /api/v1/ocr/process` - Procesar OCR
- `GET /api/v1/ocr/{document_id}` - Resultados OCR

### Búsqueda
- `POST /api/v1/search` - Búsqueda combinada (texto + similitud)
- `POST /api/v1/search/advanced` - Búsqueda avanzada

## Desarrollo

### Backend

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Scanner Agent (requiere .NET 8 SDK)

```bash
cd scanner-agent
dotnet run
```

## Licencia

MIT

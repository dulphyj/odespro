import json
from typing import Optional, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api.deps import get_db, get_current_user
from app.core.config import settings
from app.models.user import User
from app.services.audit_service import log_action

router = APIRouter(tags=["scanner"])


class ScanRequest(BaseModel):
    device_id: Optional[str] = None
    resolution: int = 300
    color_mode: str = "color"
    duplex: bool = False
    source: str = "flatbed"
    paper_size: str = "A4"
    page_count: int = 1
    folder_id: Optional[int] = None
    document_title: Optional[str] = None


class ScanPdfRequest(BaseModel):
    device_id: Optional[str] = None
    resolution: int = 300
    color_mode: str = "color"
    duplex: bool = False
    source: str = "flatbed"
    paper_size: str = "A4"
    page_count: int = 1
    folder_id: Optional[int] = None
    document_title: Optional[str] = None


class ScanImagesRequest(BaseModel):
    device_id: Optional[str] = None
    resolution: int = 300
    color_mode: str = "color"
    duplex: bool = False
    source: str = "flatbed"
    format: str = "jpeg"
    paper_size: str = "A4"
    page_count: int = 1
    folder_id: Optional[int] = None
    document_title: Optional[str] = None


COLOR_MODE_MAP = {
    "color": "Color",
    "grayscale": "Grayscale",
    "black_white": "BlackAndWhite",
}

COLOR_MODE_REVERSE = {v: k for k, v in COLOR_MODE_MAP.items()}

SOURCE_MAP = {
    "flatbed": False,
    "adf": True,
}


def _map_scan_request(body: BaseModel) -> dict:
    d = body.model_dump(exclude_none=True)
    fmt_map = {"jpeg": "Jpeg", "png": "Png", "tiff": "Tiff", "pdf": "Pdf"}
    return {
        "scannerId": d.get("device_id", ""),
        "dpi": d.get("resolution", 300),
        "colorMode": COLOR_MODE_MAP.get(d.get("color_mode", "color"), "Color"),
        "duplex": d.get("duplex", False),
        "useAdf": SOURCE_MAP.get(d.get("source", "flatbed"), False),
        "paperSize": d.get("paper_size", "A4"),
        "pageCount": d.get("page_count", 1),
        "fileFormat": fmt_map.get(d.get("format", "pdf"), "Pdf"),
        "compressionLevel": 75,
    }


def _map_scanner_info(raw: dict) -> dict:
    return {
        "id": raw.get("id", raw.get("scannerId", "")),
        "name": raw.get("name", raw.get("model", "Unknown Scanner")),
        "device_id": raw.get("device_id") or raw.get("id", raw.get("deviceId", "")),
        "vendor": raw.get("manufacturer") or raw.get("vendor", "Unknown"),
        "is_available": raw.get("is_available") if raw.get("is_available") is not None else raw.get("isAvailable", True),
        "connection": raw.get("connection_type") or raw.get("connectionType") or raw.get("device_type") or raw.get("deviceType", "USB"),
    }


def _map_scan_result(raw: dict) -> dict:
    return {
        "task_id": str(raw.get("jobId", "")),
        "status": raw.get("status", "pending"),
        "progress": raw.get("progress", 0) if raw.get("status") in ("Scanning", "Processing") else (
            100 if raw.get("status") == "Completed" else 0
        ),
    }


async def _call_scanner_agent(endpoint: str, payload: dict = None, method: str = "GET") -> dict | list | Any:
    url = f"{settings.SCANNER_AGENT_URL}{endpoint}"
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            if method == "POST":
                response = await client.post(url, json=payload or {})
            elif method == "DELETE":
                response = await client.delete(url)
            else:
                response = await client.get(url)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Scanner agent error: {e.response.text}")
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Scanner agent unavailable: {str(e)}")


@router.get("/devices")
async def list_scanner_devices(
    current_user: User = Depends(get_current_user),
):
    raw = await _call_scanner_agent("/api/scanners")
    if isinstance(raw, list):
        return [_map_scanner_info(s) for s in raw]
    return raw


@router.post("/scan")
async def scan_document(
    body: ScanRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = _map_scan_request(body)
    result = await _call_scanner_agent("/api/scan", payload, method="POST")
    mapped = _map_scan_result(result)
    await log_action(
        db, current_user.id, current_user.username, "SCAN",
        "SCANNER", None,
        "Document scanned",
        details=body.model_dump(exclude_none=True),
        ip_address=request.client.host if request.client else None,
    )
    return mapped


@router.post("/scan/pdf")
async def scan_to_pdf(
    body: ScanPdfRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = _map_scan_request(body)
    payload["fileFormat"] = "Pdf"
    result = await _call_scanner_agent("/api/scan/pdf", payload, method="POST")
    mapped = _map_scan_result(result)
    await log_action(
        db, current_user.id, current_user.username, "SCAN_PDF",
        "SCANNER", None,
        "Document scanned to PDF",
        ip_address=request.client.host if request.client else None,
    )
    return mapped


@router.post("/scan/images")
async def scan_to_images(
    body: ScanImagesRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = _map_scan_request(body)
    result = await _call_scanner_agent("/api/scan/images", payload, method="POST")
    mapped = _map_scan_result(result)
    await log_action(
        db, current_user.id, current_user.username, "SCAN_IMAGES",
        "SCANNER", None,
        "Document scanned to images",
        ip_address=request.client.host if request.client else None,
    )
    return mapped


@router.get("/status/{task_id}")
async def scanner_task_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    raw = await _call_scanner_agent(f"/api/scan/{task_id}")
    if isinstance(raw, dict):
        mapped = _map_scan_result(raw)
        # Check if scanner-agent stored a backend Document result
        backend_doc = raw.get("backend_document_id") or raw.get("backendDocumentId")
        if backend_doc and isinstance(backend_doc, str):
            # Try to parse as JSON (the full Document object was stored as string)
            try:
                doc_obj = json.loads(backend_doc)
                mapped["result"] = doc_obj
            except (json.JSONDecodeError, TypeError):
                mapped["result"] = None
        return mapped
    return raw


@router.get("/status")
async def scanner_agent_status(
    current_user: User = Depends(get_current_user),
):
    return await _call_scanner_agent("/api/status")

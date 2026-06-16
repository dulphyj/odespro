from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.core.dependencies import get_current_superuser
from app.models.user import User
from app.services import report_service

router = APIRouter(tags=["reports"])


@router.get("/daily")
async def daily_report(
    report_date: date = Query(default_factory=lambda: date.today()),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await report_service.get_daily_production(db, report_date)


@router.get("/monthly")
async def monthly_report(
    year: int = Query(default_factory=lambda: datetime.now(timezone.utc).year),
    month: int = Query(default_factory=lambda: datetime.now(timezone.utc).month, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await report_service.get_monthly_production(db, year, month)


@router.get("/by-user")
async def documents_by_user(
    date_from: datetime = Query(default_factory=lambda: datetime.now(timezone.utc).replace(day=1)),
    date_to: datetime = Query(default_factory=lambda: datetime.now(timezone.utc)),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await report_service.get_documents_by_user(db, date_from, date_to)


@router.get("/ocr-stats")
async def ocr_statistics(
    date_from: datetime = Query(default_factory=lambda: datetime.now(timezone.utc).replace(day=1)),
    date_to: datetime = Query(default_factory=lambda: datetime.now(timezone.utc)),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await report_service.get_ocr_stats(db, date_from, date_to)


@router.get("/pending")
async def pending_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await report_service.get_pending_documents(db)


@router.post("/export")
async def export_report(
    report_type: str = Query(..., description="daily/monthly/by-user/ocr-stats/pending"),
    export_format: str = Query(..., description="csv/excel/pdf"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    report_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if export_format not in ("csv", "excel", "pdf"):
        raise HTTPException(status_code=400, detail="Unsupported export format. Use csv, excel, or pdf.")

    today = date.today()
    now = datetime.now(timezone.utc)

    if report_type == "daily":
        rd = report_date or today
        data = await report_service.get_daily_production(db, rd)
        headers = ["user_id", "documents", "ocrs"]
        title = f"Daily Production Report - {rd}"
    elif report_type == "monthly":
        y = year or now.year
        m = month or now.month
        data = await report_service.get_monthly_production(db, y, m)
        headers = ["date", "count"]
        title = f"Monthly Production Report - {y}/{m:02d}"
    elif report_type == "by-user":
        df = date_from or now.replace(day=1)
        dt = date_to or now
        data = await report_service.get_documents_by_user(db, df, dt)
        headers = ["user_id", "document_count", "total_size"]
        title = "Documents by User"
    elif report_type == "ocr-stats":
        df = date_from or now.replace(day=1)
        dt = date_to or now
        data = [await report_service.get_ocr_stats(db, df, dt)]
        headers = ["total_ocrs", "avg_confidence", "avg_processing_time_ms", "date_from", "date_to"]
        title = "OCR Statistics"
    elif report_type == "pending":
        data = [await report_service.get_pending_documents(db)]
        headers = ["total_active", "without_ocr", "without_classification", "not_indexed"]
        title = "Pending Documents Report"
    else:
        raise HTTPException(status_code=400, detail="Invalid report type")

    content_type_map = {
        "csv": "text/csv",
        "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pdf": "application/pdf",
    }
    ext_map = {"csv": "csv", "excel": "xlsx", "pdf": "pdf"}

    if export_format == "csv":
        output = report_service.export_report_csv(data, headers)
        media_type = content_type_map["csv"]
    elif export_format == "excel":
        output = report_service.export_report_excel(data, headers)
        media_type = content_type_map["excel"]
    else:
        output = report_service.export_report_pdf(data, headers, title)
        media_type = content_type_map["pdf"]

    from io import BytesIO
    if isinstance(output, str):
        output = output.encode("utf-8")

    return StreamingResponse(
        BytesIO(output if isinstance(output, bytes) else output.encode()),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{report_type}_report.{ext_map[export_format]}"'},
    )

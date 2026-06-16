import csv
import io
from datetime import datetime, date, timezone
from typing import Optional

from sqlalchemy import select, func, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.ocr import OcrResult
from app.models.audit import AuditLog


async def get_daily_production(
    db: AsyncSession, report_date: date
) -> list[dict]:
    day_start = datetime.combine(report_date, datetime.min.time(), tzinfo=timezone.utc)
    day_end = datetime.combine(report_date, datetime.max.time(), tzinfo=timezone.utc)

    result = await db.execute(
        select(
            Document.owner_id,
            func.count(Document.id).label("document_count"),
        )
        .where(
            Document.created_at >= day_start,
            Document.created_at <= day_end,
            Document.is_active == True,
        )
        .group_by(Document.owner_id)
    )
    rows = result.all()

    stats = []
    for row in rows:
        ocr_count = await db.scalar(
            select(func.count())
            .select_from(OcrResult)
            .where(
                OcrResult.document_id.in_(
                    select(Document.id).where(
                        Document.owner_id == row.owner_id,
                        Document.created_at >= day_start,
                        Document.created_at <= day_end,
                    )
                )
            )
        )
        stats.append({
            "user_id": row.owner_id,
            "documents": row.document_count,
            "ocrs": ocr_count or 0,
        })
    return stats


async def get_monthly_production(
    db: AsyncSession, year: int, month: int
) -> list[dict]:
    result = await db.execute(
        select(
            cast(Document.created_at, Date).label("day"),
            func.count(Document.id).label("count"),
        )
        .where(
            func.extract("year", Document.created_at) == year,
            func.extract("month", Document.created_at) == month,
            Document.is_active == True,
        )
        .group_by(cast(Document.created_at, Date))
        .order_by("day")
    )
    rows = result.all()
    return [{"date": str(row.day), "count": row.count} for row in rows]


async def get_documents_by_user(
    db: AsyncSession, date_from: datetime, date_to: datetime
) -> list[dict]:
    result = await db.execute(
        select(
            Document.owner_id,
            func.count(Document.id).label("document_count"),
            func.sum(Document.file_size).label("total_size"),
        )
        .where(
            Document.created_at >= date_from,
            Document.created_at <= date_to,
            Document.is_active == True,
        )
        .group_by(Document.owner_id)
        .order_by(func.count(Document.id).desc())
    )
    rows = result.all()
    return [
        {
            "user_id": row.owner_id,
            "document_count": row.document_count,
            "total_size": row.total_size or 0,
        }
        for row in rows
    ]


async def get_ocr_stats(
    db: AsyncSession, date_from: datetime, date_to: datetime
) -> dict:
    result = await db.execute(
        select(
            func.count(OcrResult.id).label("total_ocrs"),
            func.avg(OcrResult.confidence).label("avg_confidence"),
            func.avg(OcrResult.processing_time_ms).label("avg_processing_time"),
        )
        .where(
            OcrResult.created_at >= date_from,
            OcrResult.created_at <= date_to,
        )
    )
    row = result.one()
    return {
        "total_ocrs": row.total_ocrs or 0,
        "avg_confidence": float(row.avg_confidence) if row.avg_confidence else 0.0,
        "avg_processing_time_ms": float(row.avg_processing_time) if row.avg_processing_time else 0.0,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
    }


async def get_pending_documents(db: AsyncSession) -> dict:
    total_active = await db.scalar(
        select(func.count()).select_from(Document).where(Document.is_active == True)
    )

    no_ocr = await db.scalar(
        select(func.count()).select_from(Document).where(
            Document.is_active == True,
            Document.id.notin_(
                select(OcrResult.document_id).distinct()
            ),
        )
    )

    no_classification = await db.scalar(
        select(func.count()).select_from(Document).where(
            Document.is_active == True,
            Document.classification.is_(None),
        )
    )

    not_indexed = await db.scalar(
        select(func.count()).select_from(Document).where(
            Document.is_active == True,
            Document.is_indexed == False,
        )
    )

    return {
        "total_active": total_active or 0,
        "without_ocr": no_ocr or 0,
        "without_classification": no_classification or 0,
        "not_indexed": not_indexed or 0,
    }


def export_report_csv(data: list[dict], headers: list[str]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in data:
        writer.writerow([row.get(h, "") for h in headers])
    return output.getvalue()


def export_report_excel(data: list[dict], headers: list[str]) -> bytes:
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in data:
        ws.append([row.get(h, "") for h in headers])
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.read()


def export_report_pdf(data: list[dict], headers: list[str], title: str) -> bytes:
    from reportlab.lib.pagesizes import letter, landscape
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors

    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=landscape(letter))
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(title, styles["Title"]))
    elements.append(Spacer(1, 20))

    table_data = [headers]
    for row in data:
        table_data.append([str(row.get(h, "")) for h in headers])

    table = Table(table_data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563EB")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F3F4F6")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
    ]))
    elements.append(table)

    doc.build(elements)
    output.seek(0)
    return output.read()

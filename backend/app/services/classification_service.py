import re
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.document import Document
from app.models.ocr import OcrResult


_CLASSIFICATION_RULES = [
    (
        "CI",
        [r"\b\d{6,11}\s*[A-Z]\b"],
        "Cédula de Identidad",
        0.9,
    ),
    (
        "NIT",
        [r"\b\d{4,}-\d+\b"],
        "Número de Identificación Tributaria",
        0.85,
    ),
    (
        "CONTRATO",
        [
            r"\bcontrato\b",
            r"\bcláusula\b",
            r"\bclausula\b",
            r"\bpartes\b",
            r"\bcomparecen\b",
        ],
        "Contrato",
        0.8,
    ),
    (
        "FACTURA",
        [
            r"\bfactura\b",
            r"\bcompra\b",
            r"\bventa\b",
            r"\btotal\b",
            r"\bsubtotal\b",
            r"\biva\b",
        ],
        "Factura",
        0.8,
    ),
    (
        "SOLICITUD",
        [
            r"\bsolicitud\b",
            r"\bsolicito\b",
            r"\bsolicita\b",
            r"\bpor medio de la presente\b",
        ],
        "Solicitud",
        0.75,
    ),
    (
        "FORMULARIO",
        [
            r"\bformulario\b",
            r"\bdiligencie\b",
            r"\bllene\b",
            r"\bcampo\b.*\bnúmero\b",
        ],
        "Formulario",
        0.75,
    ),
    (
        "CARTA",
        [
            r"\bcarta\b",
            r"\bestimado\b",
            r"\batentamente\b",
            r"\bcordialmente\b",
        ],
        "Carta",
        0.7,
    ),
    (
        "MEMORANDUM",
        [
            r"\bmemorándum\b",
            r"\bmemorandum\b",
            r"\bref\s*:",
            r"\bpara\b.*\bde\b.*\basunto\b",
        ],
        "Memorándum",
        0.85,
    ),
]


def classify_document(ocr_text: str) -> tuple[Optional[str], float]:
    if not ocr_text:
        return None, 0.0

    text_lower = ocr_text.lower()
    best_classification = None
    best_confidence = 0.0

    for code, patterns, _, weight in _CLASSIFICATION_RULES:
        match_count = 0
        for pattern in patterns:
            if re.search(pattern, text_lower):
                match_count += 1

        if match_count > 0:
            confidence = min(1.0, (match_count / len(patterns)) * weight)
            if confidence > best_confidence:
                best_confidence = confidence
                best_classification = code

    return best_classification, best_confidence


async def classify_document_by_text(db: AsyncSession, document_id: int) -> None:
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalars().first()
    if not document:
        raise NotFoundError(f"Document with id {document_id} not found")

    ocr_result = await db.execute(
        select(OcrResult)
        .where(OcrResult.document_id == document_id)
        .order_by(OcrResult.created_at.desc())
        .limit(1)
    )
    ocr = ocr_result.scalars().first()
    if not ocr or not ocr.full_text:
        return

    classification, confidence = classify_document(ocr.full_text)
    if classification:
        document.classification = classification
        document.classification_confidence = confidence
        db.add(document)
        await db.flush()

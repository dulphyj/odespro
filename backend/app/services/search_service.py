import time
from typing import Optional

import httpx
from sqlalchemy import select, func, or_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError
from app.models.document import Document
from app.models.audit import SearchVector
from app.models.ocr import OcrResult
from app.schemas.search import SearchRequest, SearchResponse


_MODEL_URL = "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2"


async def generate_embedding(text: str) -> list[float]:
    if not text.strip():
        return []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                _MODEL_URL,
                json={"inputs": text[:512]},
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            embedding = response.json()
            if isinstance(embedding, list) and embedding and isinstance(embedding[0], list):
                return embedding[0]
            return embedding
    except httpx.HTTPError:
        return []


async def index_document(db: AsyncSession, document_id: int) -> None:
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
    ocr_text = ocr.full_text if ocr and ocr.full_text else ""

    content_parts = [
        document.title or "",
        document.description or "",
        ocr_text,
    ]
    content_text = "\n".join(p for p in content_parts if p)

    embedding = await generate_embedding(content_text)

    existing = await db.execute(
        select(SearchVector).where(SearchVector.document_id == document_id)
    )
    sv = existing.scalars().first()
    if sv:
        sv.content_text = content_text
        sv.embedding = {"vector": embedding}
    else:
        sv = SearchVector(
            document_id=document_id,
            content_text=content_text,
            embedding={"vector": embedding},
        )
    db.add(sv)

    document.is_indexed = True
    db.add(document)
    await db.flush()


async def search_by_text(
    db: AsyncSession, query: str, skip: int = 0, limit: int = 100
) -> tuple[list[Document], int]:
    search_term = f"%{query}%"
    base = (
        select(Document)
        .where(Document.is_active == True)
        .where(
            or_(
                Document.title.ilike(search_term),
                Document.description.ilike(search_term),
                Document.id.in_(
                    select(SearchVector.document_id).where(
                        SearchVector.content_text.ilike(search_term)
                    )
                ),
            )
        )
    )

    count_query = select(func.count()).select_from(base.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    base = base.order_by(Document.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(base)
    documents = list(result.scalars().all())

    return documents, total


async def search_by_similarity(
    db: AsyncSession, query: str, skip: int = 0, limit: int = 100
) -> tuple[list[Document], int]:
    query_embedding = await generate_embedding(query)
    if not query_embedding:
        return [], 0

    embedding_json = str(query_embedding)

    count_sql = text(
        """
        SELECT COUNT(*) FROM documents d
        INNER JOIN search_vectors sv ON sv.document_id = d.id
        WHERE d.is_active = TRUE
          AND sv.embedding IS NOT NULL
        """
    )
    total_result = await db.execute(count_sql)
    total = total_result.scalar() or 0

    sql = text(
        """
        SELECT d.id, d.title, d.description, d.file_name, d.file_size,
               d.mime_type, d.folder_id, d.document_type_id, d.owner_id,
               d.current_version, d.storage_path, d.checksum,
               d.page_count, d.is_indexed, d.classification,
               d.classification_confidence, d.metadata, d.is_active,
               d.created_at, d.updated_at,
               1 - (sv.embedding::jsonb->>'vector')::vector <=> :query_vec AS distance
        FROM documents d
        INNER JOIN search_vectors sv ON sv.document_id = d.id
        WHERE d.is_active = TRUE
          AND sv.embedding IS NOT NULL
        ORDER BY distance
        OFFSET :skip
        LIMIT :limit
        """
    )

    result = await db.execute(
        sql,
        {"query_vec": embedding_json, "skip": skip, "limit": limit},
    )
    rows = result.fetchall()

    documents = []
    for row in rows:
        doc_dict = dict(row._mapping)
        doc_dict.pop("distance", None)
        doc = Document(**doc_dict)
        documents.append(doc)

    return documents, total


async def search_combined(
    db: AsyncSession, search_request: SearchRequest
) -> SearchResponse:
    start_time = time.time()

    query = search_request.query
    skip = (search_request.page - 1) * search_request.page_size
    limit = search_request.page_size

    text_docs, text_total = await search_by_text(db, query, 0, 100)
    sim_docs, sim_total = await search_by_similarity(db, query, 0, 100)

    seen = set()
    combined = []
    for doc in sim_docs + text_docs:
        if doc.id not in seen:
            seen.add(doc.id)
            combined.append(doc)

    total = len(combined)
    paginated = combined[skip : skip + limit]
    execution_time = int((time.time() - start_time) * 1000)

    from app.schemas.document import DocumentResponse
    items = [DocumentResponse.model_validate(d) for d in paginated]

    return SearchResponse(
        items=items,
        total=total,
        query=query,
        page=search_request.page,
        page_size=search_request.page_size,
        execution_time_ms=execution_time,
    )


async def reindex_all(db: AsyncSession) -> int:
    result = await db.execute(
        select(Document).where(Document.is_active == True)
    )
    documents = list(result.scalars().all())
    count = 0
    for doc in documents:
        try:
            await index_document(db, doc.id)
            count += 1
        except Exception:
            continue
    return count

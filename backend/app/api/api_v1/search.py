from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.core.dependencies import get_current_superuser
from app.models.user import User
from app.schemas.search import SearchRequest, SearchResponse
from app.schemas.common import MessageResponse
from app.services import search_service
from app.services.audit_service import log_action

router = APIRouter(tags=["search"])


@router.post("", response_model=SearchResponse)
async def search(
    body: SearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await search_service.search_combined(db, body)


@router.post("/advanced", response_model=SearchResponse)
async def advanced_search(
    body: SearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.document_service import search_documents_fulltext
    from app.schemas.document import DocumentResponse
    import time

    start = time.time()
    skip = (body.page - 1) * body.page_size
    docs, total = await search_documents_fulltext(db, body.query, body.filters, skip, body.page_size)
    execution_time = int((time.time() - start) * 1000)

    items = [DocumentResponse.model_validate(d) for d in docs]
    return SearchResponse(
        items=items,
        total=total,
        query=body.query,
        page=body.page,
        page_size=body.page_size,
        execution_time_ms=execution_time,
    )


@router.post("/reindex", response_model=MessageResponse)
async def reindex_all_documents(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    count = await search_service.reindex_all(db)
    await log_action(
        db, current_user.id, current_user.username, "REINDEX",
        "SEARCH", None,
        f"Reindexed {count} documents",
        ip_address=request.client.host if request.client else None,
    )
    return MessageResponse(message=f"Reindexed {count} documents successfully")


@router.post("/similar/{document_id}", response_model=SearchResponse)
async def find_similar_documents(
    document_id: int,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import select
    from app.models.audit import SearchVector
    from app.schemas.document import DocumentResponse
    import time

    start = time.time()

    result = await db.execute(
        select(SearchVector).where(SearchVector.document_id == document_id)
    )
    sv = result.scalars().first()
    if not sv or not sv.embedding or "vector" not in sv.embedding:
        return SearchResponse(
            items=[],
            total=0,
            query=f"similar_to_{document_id}",
            page=page,
            page_size=page_size,
            execution_time_ms=0,
        )

    query_embedding = sv.embedding["vector"]

    from sqlalchemy import text
    skip = (page - 1) * page_size
    embedding_json = str(query_embedding)

    count_sql = text("""
        SELECT COUNT(*) FROM documents d
        INNER JOIN search_vectors sv2 ON sv2.document_id = d.id
        WHERE d.is_active = TRUE AND sv2.embedding IS NOT NULL
    """)
    total_result = await db.execute(count_sql)
    total = total_result.scalar() or 0

    sql = text("""
        SELECT d.id, d.title, d.description, d.file_name, d.file_size,
               d.mime_type, d.folder_id, d.document_type_id, d.owner_id,
               d.current_version, d.storage_path, d.checksum,
               d.page_count, d.is_indexed, d.classification,
               d.classification_confidence, d.metadata, d.is_active,
               d.created_at, d.updated_at,
               1 - (sv2.embedding::jsonb->>'vector')::vector <=> :query_vec AS distance
        FROM documents d
        INNER JOIN search_vectors sv2 ON sv2.document_id = d.id
        WHERE d.is_active = TRUE AND sv2.embedding IS NOT NULL
        ORDER BY distance
        OFFSET :skip
        LIMIT :limit
    """)
    result = await db.execute(sql, {"query_vec": embedding_json, "skip": skip, "limit": page_size})
    rows = result.fetchall()

    from app.models.document import Document
    documents = []
    for row in rows:
        doc_dict = dict(row._mapping)
        doc_dict.pop("distance", None)
        documents.append(Document(**doc_dict))

    execution_time = int((time.time() - start) * 1000)
    items = [DocumentResponse.model_validate(d) for d in documents]

    return SearchResponse(
        items=items,
        total=total,
        query=f"similar_to_{document_id}",
        page=page,
        page_size=page_size,
        execution_time_ms=execution_time,
    )

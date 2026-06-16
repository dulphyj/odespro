from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from .document import DocumentResponse


class SearchRequest(BaseModel):
    query: str
    filters: Optional[Dict[str, Any]] = None
    page: int = 1
    page_size: int = 20


class SearchResponse(BaseModel):
    items: List[DocumentResponse]
    total: int
    query: str
    page: int
    page_size: int
    execution_time_ms: Optional[int] = None

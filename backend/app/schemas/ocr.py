from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, computed_field


class OcrRequest(BaseModel):
    document_id: int
    pages: Optional[List[int]] = None


class OcrResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def text(self) -> str:
        return self.full_text

    id: int
    document_id: int
    page_id: int
    full_text: str
    confidence: float
    processing_time_ms: Optional[int] = None
    language: Optional[str] = None
    created_at: datetime


class OcrResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def text(self) -> str:
        return self.full_text

    id: int
    document_id: int
    page_number: int
    full_text: str
    confidence: float
    created_at: datetime

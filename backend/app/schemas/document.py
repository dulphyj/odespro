from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, computed_field


class DocumentTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    retention_days: Optional[int] = None
    requires_ocr: bool = False


class DocumentPageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def image_url(self) -> str:
        return f"/api/v1/documents/{self.document_id}/pages/{self.id}/image"

    @computed_field
    @property
    def thumbnail_url(self) -> str:
        return f"/api/v1/documents/{self.document_id}/pages/{self.id}/thumbnail"

    id: int
    document_id: int
    page_number: int
    storage_path: str
    thumbnail_path: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    rotation: int = 0
    ocr_text: Optional[str] = None
    ocr_confidence: Optional[float] = None


class DocumentVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    version_number: int
    file_name: str
    file_size: int
    changes_description: Optional[str] = None
    created_by: int
    created_at: datetime


class DocumentIndexResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    field_name: str
    field_value: str
    field_type: Optional[str] = None


class DocumentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    folder_id: Optional[int] = None
    document_type_id: Optional[int] = None


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    folder_id: Optional[int] = None
    document_type_id: Optional[int] = None


class _OwnerInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def file_type(self) -> str:
        if not self.mime_type:
            return "other"
        mt = self.mime_type.lower()
        if "pdf" in mt:
            return "pdf"
        if "image" in mt or mt.startswith("image/"):
            return "image"
        if "word" in mt or "officedocument.word" in mt or mt.endswith("msword"):
            return "word"
        if "excel" in mt or "officedocument.spreadsheet" in mt or mt.endswith("ms-excel"):
            return "excel"
        if "text" in mt or mt.startswith("text/"):
            return "text"
        return "other"

    @computed_field
    @property
    def file(self) -> str:
        return f"/api/v1/documents/{self.id}/download?inline=true"

    @computed_field
    @property
    def ocr_processed(self) -> bool:
        return bool(self.is_indexed)

    @computed_field
    @property
    def ocr_text(self) -> Optional[str]:
        return None

    id: int
    title: str
    description: Optional[str] = None
    tags: List[str] = []
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    folder_id: Optional[int] = None
    document_type_id: Optional[int] = None
    owner_id: int
    current_version: int = 1
    checksum: Optional[str] = None
    page_count: Optional[int] = None
    is_indexed: bool = False
    classification: Optional[str] = None
    classification_confidence: Optional[float] = None
    metadata_: Optional[Dict[str, Any]] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    owner: Optional[_OwnerInfo] = None
    folder: Optional[Dict[str, Any]] = None
    document_type: Optional[DocumentTypeResponse] = None


class DocumentListResponse(BaseModel):
    items: List[DocumentResponse]
    total: int
    page: int
    page_size: int

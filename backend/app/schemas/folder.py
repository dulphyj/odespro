from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class FolderCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[int] = None


class FolderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    path: Optional[str] = None
    owner_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    children: List["FolderResponse"] = []
    document_count: int = 0

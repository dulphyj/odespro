from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models.folder import Folder
from app.models.document import Document
from app.schemas.folder import FolderCreate, FolderUpdate


async def get_folders(
    db: AsyncSession, parent_id: Optional[int] = None
) -> list[Folder]:
    query = select(Folder).where(Folder.is_active == True)
    if parent_id is not None:
        query = query.where(Folder.parent_id == parent_id)
    else:
        query = query.where(Folder.parent_id.is_(None))
    query = query.order_by(Folder.name)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_folder(db: AsyncSession, folder_id: int) -> Folder:
    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalars().first()
    if not folder:
        raise NotFoundError(f"Folder with id {folder_id} not found")
    return folder


async def create_folder(
    db: AsyncSession, folder_create: FolderCreate, user_id: int
) -> Folder:
    path = folder_create.name
    if folder_create.parent_id:
        parent = await get_folder(db, folder_create.parent_id)
        path = f"{parent.path}/{folder_create.name}" if parent.path else folder_create.name

    folder = Folder(
        name=folder_create.name,
        description=folder_create.description,
        parent_id=folder_create.parent_id,
        path=path,
        owner_id=user_id,
    )
    db.add(folder)
    await db.flush()
    return folder


async def update_folder(
    db: AsyncSession, folder_id: int, folder_update: FolderUpdate
) -> Folder:
    folder = await get_folder(db, folder_id)
    update_data = folder_update.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] != folder.name:
        old_path = folder.path
        folder.name = update_data["name"]
        folder.path = _compute_path(folder)
        if old_path:
            await _update_children_paths(db, folder_id, old_path, folder.path)

    if "parent_id" in update_data:
        new_parent_id = update_data.pop("parent_id")
        old_path = folder.path
        folder.parent_id = new_parent_id
        folder.path = _compute_path(folder)
        if old_path:
            await _update_children_paths(db, folder_id, old_path, folder.path)

    for field, value in update_data.items():
        setattr(folder, field, value)

    db.add(folder)
    await db.flush()
    return folder


def _compute_path(folder: Folder) -> str:
    if folder.parent_id:
        return f"{folder.path.rsplit('/', 1)[0] if '/' in (folder.path or '') else ''}/{folder.name}"
    return folder.name


async def _update_children_paths(
    db: AsyncSession, parent_id: int, old_parent_path: str, new_parent_path: str
) -> None:
    result = await db.execute(
        select(Folder).where(Folder.parent_id == parent_id)
    )
    children = result.scalars().all()
    for child in children:
        child.path = child.path.replace(old_parent_path, new_parent_path, 1)
        db.add(child)
        await _update_children_paths(db, child.id, old_parent_path, new_parent_path)


async def delete_folder(db: AsyncSession, folder_id: int) -> None:
    folder = await get_folder(db, folder_id)

    children_result = await db.execute(
        select(func.count()).select_from(Folder).where(Folder.parent_id == folder_id, Folder.is_active == True)
    )
    child_count = children_result.scalar()
    if child_count > 0:
        raise ValidationError(f"Cannot delete folder: it has {child_count} subfolder(s)")

    docs_result = await db.execute(
        select(func.count()).select_from(Document).where(Document.folder_id == folder_id, Document.is_active == True)
    )
    doc_count = docs_result.scalar()
    if doc_count > 0:
        raise ValidationError(f"Cannot delete folder: it contains {doc_count} document(s)")

    await db.delete(folder)
    await db.flush()


async def get_folder_tree(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(Folder).where(Folder.is_active == True).order_by(Folder.path)
    )
    folders = result.scalars().all()

    folder_map: dict[int, dict] = {}
    roots: list[dict] = []

    for f in folders:
        doc_count = await db.scalar(
            select(func.count()).select_from(Document).where(
                Document.folder_id == f.id, Document.is_active == True
            )
        )
        folder_map[f.id] = {
            "id": f.id,
            "name": f.name,
            "description": f.description,
            "parent_id": f.parent_id,
            "path": f.path,
            "owner_id": f.owner_id,
            "document_count": doc_count or 0,
            "children": [],
        }

    for f in folders:
        node = folder_map[f.id]
        if f.parent_id and f.parent_id in folder_map:
            folder_map[f.parent_id]["children"].append(node)
        else:
            roots.append(node)

    return roots

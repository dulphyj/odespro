from fastapi import APIRouter

from app.api.api_v1.auth import router as auth_router
from app.api.api_v1.users import router as users_router
from app.api.api_v1.roles import router as roles_router
from app.api.api_v1.folders import router as folders_router
from app.api.api_v1.documents import router as documents_router
from app.api.api_v1.ocr import router as ocr_router
from app.api.api_v1.scanner import router as scanner_router
from app.api.api_v1.search import router as search_router
from app.api.api_v1.audit import router as audit_router
from app.api.api_v1.reports import router as reports_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth")
api_router.include_router(users_router, prefix="/users")
api_router.include_router(roles_router, prefix="/roles")
api_router.include_router(folders_router, prefix="/folders")
api_router.include_router(documents_router, prefix="/documents")
api_router.include_router(ocr_router, prefix="/ocr")
api_router.include_router(scanner_router, prefix="/scanner")
api_router.include_router(search_router, prefix="/search")
api_router.include_router(audit_router, prefix="/audit")
api_router.include_router(reports_router, prefix="/reports")

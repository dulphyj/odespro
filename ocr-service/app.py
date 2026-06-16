import os
import tempfile
import logging
import uuid
import traceback
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ocr_processor import OcrProcessor
from classification import ClassificationEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

TEMP_DIR = os.path.join(tempfile.gettempdir(), "ocr_service")
os.makedirs(TEMP_DIR, exist_ok=True)

ocr_processor: Optional[OcrProcessor] = None
classifier: Optional[ClassificationEngine] = None
MODEL_INFO = {
    "engine": "PaddleOCR",
    "version": "2.9.0",
    "language": "spanish",
    "backend": "CPU",
    "max_image_dimension": 4000,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global ocr_processor, classifier
    logger.info("Starting OCR Service...")
    os.makedirs(TEMP_DIR, exist_ok=True)
    ocr_processor = OcrProcessor(lang="es", use_gpu=False)
    classifier = ClassificationEngine()
    logger.info("OCR Service ready on port 8001")
    yield
    logger.info("Shutting down OCR Service...")
    if os.path.exists(TEMP_DIR):
        for f in os.listdir(TEMP_DIR):
            try:
                os.remove(os.path.join(TEMP_DIR, f))
            except Exception:
                pass


app = FastAPI(
    title="OCR Service",
    description="Document OCR and Classification Service powered by PaddleOCR",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/tiff",
    "image/bmp",
    "image/webp",
}

ALLOWED_PDF_TYPES = {"application/pdf"}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


class HealthResponse(BaseModel):
    status: str
    service: str
    language: str
    model: str


class ModelsResponse(BaseModel):
    models: list
    language: str
    backend: str


class OcrResponse(BaseModel):
    success: bool
    text: str
    confidence: float
    processing_time_ms: int
    language: str
    page_count: int
    bounding_boxes: list


class BatchOcrResponse(BaseModel):
    success: bool
    results: list
    total_files: int
    successful: int
    failed: int


class ClassifyRequest(BaseModel):
    text: str


class ClassifyResponse(BaseModel):
    success: bool
    document_type: str
    confidence: float
    matches: dict
    matched_patterns: list


class ErrorResponse(BaseModel):
    success: bool
    error: str
    detail: Optional[str] = None


def _save_upload(upload: UploadFile, suffix: str) -> str:
    file_id = uuid.uuid4().hex
    dest = os.path.join(TEMP_DIR, f"{file_id}{suffix}")
    with open(dest, "wb") as f:
        f.write(upload.file.read())
    return dest


def _cleanup(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as exc:
        logger.warning("Cleanup failed for %s: %s", path, exc)


def _validate_image(upload: UploadFile):
    if upload.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {upload.content_type}. "
            f"Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}",
        )


def _validate_pdf(upload: UploadFile):
    if upload.content_type not in ALLOWED_PDF_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {upload.content_type}. Expected application/pdf",
        )


@app.get("/health", response_model=HealthResponse)
async def health():
    if ocr_processor is None:
        raise HTTPException(status_code=503, detail="OCR processor not initialized")
    return HealthResponse(
        status="ok",
        service="ocr-service",
        language=ocr_processor.lang,
        model="PaddleOCR",
    )


@app.get("/models", response_model=ModelsResponse)
async def models():
    return ModelsResponse(
        models=["PaddleOCR (spanish)"],
        language="spanish",
        backend=MODEL_INFO["backend"],
    )


@app.get("/", response_model=HealthResponse)
async def root():
    return await health()


@app.post("/ocr/file", response_model=OcrResponse)
async def ocr_file(file: UploadFile = File(...)):
    if ocr_processor is None:
        raise HTTPException(status_code=503, detail="OCR processor not initialized")
    _validate_image(file)
    ext = os.path.splitext(file.filename or "image.png")[1] or ".png"
    filepath = None
    try:
        filepath = _save_upload(file, ext)
        result = ocr_processor.process_image(filepath)
        return OcrResponse(
            success=True,
            text=result.text,
            confidence=result.confidence,
            processing_time_ms=result.processing_time_ms,
            language=result.language,
            page_count=result.page_count,
            bounding_boxes=[b.to_dict() for b in result.bounding_boxes],
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("OCR file error: %s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if filepath:
            _cleanup(filepath)


@app.post("/ocr/batch", response_model=BatchOcrResponse)
async def ocr_batch(files: list[UploadFile] = File(...)):
    if ocr_processor is None:
        raise HTTPException(status_code=503, detail="OCR processor not initialized")
    results = []
    successful = 0
    failed = 0
    cleanup_paths = []
    try:
        for f in files:
            _validate_image(f)
            ext = os.path.splitext(f.filename or "image.png")[1] or ".png"
            filepath = _save_upload(f, ext)
            cleanup_paths.append(filepath)
            try:
                result = ocr_processor.process_image(filepath)
                results.append(
                    {
                        "filename": f.filename or "unknown",
                        "success": True,
                        "text": result.text,
                        "confidence": result.confidence,
                        "processing_time_ms": result.processing_time_ms,
                        "page_count": result.page_count,
                        "bounding_boxes": [b.to_dict() for b in result.bounding_boxes],
                    }
                )
                successful += 1
            except Exception as exc:
                logger.error("Batch item error %s: %s", f.filename, exc)
                results.append(
                    {
                        "filename": f.filename or "unknown",
                        "success": False,
                        "error": str(exc),
                    }
                )
                failed += 1
        return BatchOcrResponse(
            success=True,
            results=results,
            total_files=len(files),
            successful=successful,
            failed=failed,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Batch OCR error: %s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        for p in cleanup_paths:
            _cleanup(p)


@app.post("/ocr/pdf", response_model=BatchOcrResponse)
async def ocr_pdf(file: UploadFile = File(...), dpi: int = Form(300)):
    if ocr_processor is None:
        raise HTTPException(status_code=503, detail="OCR processor not initialized")
    _validate_pdf(file)
    filepath = None
    try:
        filepath = _save_upload(file, ".pdf")
        page_results = ocr_processor.process_pdf(filepath, dpi=dpi)
        results = []
        successful = 0
        for i, result in enumerate(page_results):
            results.append(
                {
                    "filename": f"page_{i + 1}",
                    "success": True,
                    "text": result.text,
                    "confidence": result.confidence,
                    "processing_time_ms": result.processing_time_ms,
                    "page_count": result.page_count,
                    "bounding_boxes": [b.to_dict() for b in result.bounding_boxes],
                }
            )
            successful += 1
        return BatchOcrResponse(
            success=True,
            results=results,
            total_files=len(page_results),
            successful=successful,
            failed=0,
        )
    except ImportError as exc:
        raise HTTPException(
            status_code=501,
            detail="PDF processing not available. Install pdf2image: pip install pdf2image",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("PDF OCR error: %s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if filepath:
            _cleanup(filepath)


@app.post("/classify", response_model=ClassifyResponse)
async def classify(request: ClassifyRequest):
    if classifier is None:
        raise HTTPException(status_code=503, detail="Classifier not initialized")
    try:
        result = classifier.classify(request.text)
        return ClassifyResponse(
            success=True,
            document_type=result.document_type,
            confidence=result.confidence,
            matches=result.matches,
            matched_patterns=result.matched_patterns,
        )
    except Exception as exc:
        logger.error("Classification error: %s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8001, reload=False)

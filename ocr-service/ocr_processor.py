import io
import time
import logging
import os
from dataclasses import dataclass, field, asdict
from typing import Optional

import cv2
import numpy as np
from PIL import Image
from paddleocr import PaddleOCR

logger = logging.getLogger(__name__)


@dataclass
class BoundingBox:
    text: str
    confidence: float
    x_min: float
    y_min: float
    x_max: float
    y_max: float

    def to_dict(self):
        return {
            "text": self.text,
            "confidence": self.confidence,
            "x_min": self.x_min,
            "y_min": self.y_min,
            "x_max": self.x_max,
            "y_max": self.y_max,
        }


@dataclass
class OcrResult:
    text: str
    confidence: float
    processing_time_ms: int
    language: str
    raw_data: list
    page_count: int
    bounding_boxes: list = field(default_factory=list)

    def to_dict(self):
        result = asdict(self)
        return result


# Maximum dimension for OCR preprocessing (pixels)
MAX_IMAGE_DIMENSION = 4000


def convert_to_rgb(image: np.ndarray) -> np.ndarray:
    if len(image.shape) == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    if image.shape[2] == 4:
        return cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)
    if image.shape[2] == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    return image


def resize_if_large(image: np.ndarray) -> np.ndarray:
    h, w = image.shape[:2]
    if max(h, w) > MAX_IMAGE_DIMENSION:
        scale = MAX_IMAGE_DIMENSION / max(h, w)
        new_w = int(w * scale)
        new_h = int(h * scale)
        logger.info("Resizing image from (%d, %d) to (%d, %d)", w, h, new_w, new_h)
        return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return image


def preprocess_image(image: np.ndarray) -> np.ndarray:
    image = convert_to_rgb(image)
    image = resize_if_large(image)
    return image


class OcrProcessor:
    def __init__(self, lang: str = "es", use_gpu: bool = False):
        self.lang = lang
        self.use_gpu = use_gpu
        logger.info("Initializing PaddleOCR with language='%s', use_gpu=%s", lang, use_gpu)
        self.ocr = PaddleOCR(
            use_angle_cls=True,
            lang=lang,
            use_gpu=use_gpu,
            show_log=False,
            rec_batch_num=6,
        )
        logger.info("PaddleOCR initialized successfully")

    def process_image(self, image_path: str) -> OcrResult:
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")
        start = time.time()
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Failed to read image: {image_path}")
        image = preprocess_image(image)
        raw = self.ocr.ocr(image, cls=True)
        elapsed = int((time.time() - start) * 1000)
        return self._build_result(raw, elapsed)

    def process_image_bytes(self, image_bytes: bytes) -> OcrResult:
        start = time.time()
        file_bytes = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        if image is None:
            image = self._load_bytes_pil_safe(image_bytes)
        image = preprocess_image(image)
        raw = self.ocr.ocr(image, cls=True)
        elapsed = int((time.time() - start) * 1000)
        return self._build_result(raw, elapsed)

    def _load_bytes_pil_safe(self, image_bytes: bytes) -> np.ndarray:
        pil_image = Image.open(io.BytesIO(image_bytes))
        if pil_image.mode != "RGB":
            pil_image = pil_image.convert("RGB")
        return np.array(pil_image)

    def process_batch(self, image_paths: list) -> list:
        results = []
        for path in image_paths:
            try:
                result = self.process_image(path)
                results.append(result)
            except Exception as exc:
                logger.error("Error processing %s: %s", path, exc)
                results.append(
                    OcrResult(
                        text="",
                        confidence=0.0,
                        processing_time_ms=0,
                        language=self.lang,
                        raw_data=[],
                        page_count=0,
                        bounding_boxes=[],
                    )
                )
        return results

    def process_pdf(self, pdf_path: str, dpi: int = 300) -> list:
        try:
            from pdf2image import convert_from_path
        except ImportError:
            raise ImportError(
                "pdf2image is required for PDF processing. Install with: pip install pdf2image"
            )
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF not found: {pdf_path}")
        logger.info("Converting PDF '%s' to images at %d DPI", pdf_path, dpi)
        images = convert_from_path(pdf_path, dpi=dpi)
        results = []
        for page_num, pil_image in enumerate(images, start=1):
            logger.info("OCR processing page %d/%d", page_num, len(images))
            if pil_image.mode != "RGB":
                pil_image = pil_image.convert("RGB")
            image = np.array(pil_image)
            image = resize_if_large(image)
            start = time.time()
            raw = self.ocr.ocr(image, cls=True)
            elapsed = int((time.time() - start) * 1000)
            result = self._build_result(raw, elapsed, page_count=len(images))
            results.append(result)
        return results

    def _build_result(
        self, raw: list, elapsed_ms: int, page_count: int = 1
    ) -> OcrResult:
        text = self.get_text_from_result(raw)
        confidence = self.get_confidence_from_result(raw)
        boxes = self.get_bounding_boxes(raw)
        return OcrResult(
            text=text,
            confidence=confidence,
            processing_time_ms=elapsed_ms,
            language=self.lang,
            raw_data=raw,
            page_count=page_count,
            bounding_boxes=boxes,
        )

    @staticmethod
    def get_text_from_result(ocr_result) -> str:
        lines = []
        if not ocr_result or not isinstance(ocr_result, list):
            return ""
        for page in ocr_result:
            if page is None:
                continue
            for line in page:
                if line and len(line) >= 2:
                    text_info = line[1]
                    if text_info and len(text_info) >= 1:
                        lines.append(text_info[0])
        return "\n".join(lines)

    @staticmethod
    def get_confidence_from_result(ocr_result) -> float:
        scores = []
        if not ocr_result or not isinstance(ocr_result, list):
            return 0.0
        for page in ocr_result:
            if page is None:
                continue
            for line in page:
                if line and len(line) >= 2:
                    text_info = line[1]
                    if text_info and len(text_info) >= 2:
                        scores.append(float(text_info[1]))
        if not scores:
            return 0.0
        return sum(scores) / len(scores)

    @staticmethod
    def get_bounding_boxes(ocr_result) -> list:
        boxes = []
        if not ocr_result or not isinstance(ocr_result, list):
            return boxes
        for page in ocr_result:
            if page is None:
                continue
            for line in page:
                if line and len(line) >= 2:
                    coords = line[0]
                    text_info = line[1]
                    if coords and text_info:
                        xs = [p[0] for p in coords]
                        ys = [p[1] for p in coords]
                        boxes.append(
                            BoundingBox(
                                text=text_info[0],
                                confidence=float(text_info[1]),
                                x_min=float(min(xs)),
                                y_min=float(min(ys)),
                                x_max=float(max(xs)),
                                y_max=float(max(ys)),
                            )
                        )
        return boxes

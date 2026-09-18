import hashlib
import io
import re
import subprocess
import tempfile
from pathlib import Path
from PIL import Image
from pypdf import PdfReader
from ..config import settings

MAX_BYTES = 10 * 1024 * 1024
TYPES = {".pdf": "application/pdf", ".txt": "text/plain", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


def validate_bytes(filename, data):
    suffix = Path(filename).suffix.lower()
    if suffix not in TYPES:
        raise ValueError("Supported files: PDF, TXT, JPG, PNG")
    if not data or len(data) > MAX_BYTES:
        raise ValueError("Upload a nonempty file no larger than 10 MB")
    if suffix == ".pdf" and not data.startswith(b"%PDF-"):
        raise ValueError("File content is not a PDF")
    if suffix in {".jpg", ".jpeg", ".png"}:
        with Image.open(io.BytesIO(data)) as img:
            if img.width * img.height > 20_000_000:
                raise ValueError("Image exceeds 20 megapixels")
            if img.format not in {"JPEG", "PNG"}:
                raise ValueError("Unsupported image content")
            img.verify()
    if suffix == ".txt":
        data.decode("utf-8")
    return suffix, TYPES[suffix]


def ocr_image(data):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "image.png"
        with Image.open(io.BytesIO(data)) as img:
            img.convert("RGB").save(path)
        try:
            result = subprocess.run(["tesseract", str(path), "stdout", "-l", "eng"],
                                    capture_output=True, text=True, timeout=30, check=True)
            return result.stdout
        except FileNotFoundError:
            raise ValueError("Tesseract is not installed. Install it or use the Docker setup for image OCR.")


def extract(data, suffix):
    if suffix == ".txt":
        return data.decode("utf-8")[:200000], "text"
    if suffix == ".pdf":
        pdf = PdfReader(io.BytesIO(data))
        if pdf.is_encrypted:
            raise ValueError("Password-protected PDFs are unsupported")
        if len(pdf.pages) > 40:
            raise ValueError("Split documents into files of at most 40 pages")
        texts = []
        ocr_pages = 0
        for i, page in enumerate(pdf.pages):
            text = (page.extract_text() or "").strip()
            if len(text) < 20 and ocr_pages < 5:
                import fitz
                with fitz.open(stream=data, filetype="pdf") as rendered:
                    rect = rendered[i].rect
                    scale = min(1.5, (4_000_000 / max(rect.width * rect.height, 1)) ** 0.5)
                    pix = rendered[i].get_pixmap(matrix=fitz.Matrix(scale, scale))
                    text = ocr_image(pix.tobytes("png"))
                    ocr_pages += 1
            texts.append(f"[Page {i + 1}]\n{text}")
        return "\n\n".join(texts)[:200000], "pdf_text_and_ocr" if ocr_pages else "pdf_text"
    return ocr_image(data)[:200000], "tesseract_ocr"


def analyze(text, method):
    # This extracts candidate evidence. It does not decide legal compliance.
    topics = [topic for topic, words in {
        "Ventilation": ["ventilation", "methane", "airflow"],
        "Electrical": ["electrical", "isolation", "earthing"],
        "Environment": ["dust", "water", "emission"],
        "Workforce": ["training", "ppe", "attendance"],
        "Fire": ["fire", "extinguisher"],
    }.items() if any(w in text.lower() for w in words)]
    dates = re.findall(r"\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b", text)
    return {"method": method, "characters": len(text), "topics": topics, "candidate_dates": sorted(set(dates))[:30],
            "review_required": True, "note": "Extracted text and dates require human review. This is not a statutory compliance determination."}


def s3():
    import boto3
    return boto3.client("s3", endpoint_url=settings.r2_endpoint, aws_access_key_id=settings.r2_access_key,
                       aws_secret_access_key=settings.r2_secret_key, region_name="auto")


def store_bytes(key, data, mime):
    if settings.storage_backend == "r2":
        s3().put_object(Bucket=settings.r2_bucket, Key=key, Body=data, ContentType=mime)
    else:
        (Path(settings.upload_dir) / key).write_bytes(data)


def read_bytes(key):
    if settings.storage_backend == "r2":
        return s3().get_object(Bucket=settings.r2_bucket, Key=key)["Body"].read()
    return (Path(settings.upload_dir) / key).read_bytes()


def delete_bytes(key):
    if settings.storage_backend == "r2":
        s3().delete_object(Bucket=settings.r2_bucket, Key=key)
    else:
        (Path(settings.upload_dir) / key).unlink(missing_ok=True)


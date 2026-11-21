"""Local OCR for user-supplied images; no images are stored on disk."""
import io
import shutil
import subprocess
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class OCRError(Exception):
    def __init__(self, message: str, status: int = 422):
        self.message, self.status = message, status


def extract_text(data: bytes) -> str:
    if not data or len(data) > MAX_BYTES:
        raise OCRError('Choose an image no larger than 10 MB.', 413 if data else 422)
    if not shutil.which('tesseract'):
        raise OCRError('OCR is unavailable: install Tesseract and restart the backend.', 503)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.format not in {'JPEG', 'PNG', 'WEBP'}:
                    raise OCRError('Use a JPEG, PNG, or WebP image.')
                if image.width * image.height > MAX_PIXELS:
                    raise OCRError('Image dimensions are too large (maximum 20 megapixels).')
                image = ImageOps.exif_transpose(image).convert('RGB')
                image.load()
                buffer = io.BytesIO()
                image.save(buffer, format='PNG')
                scale = min(3.0, 1600 / max(image.size))
                enhanced = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS) if scale > 1 else image
                enhanced_buffer = io.BytesIO()
                enhanced.save(enhanced_buffer, format='PNG')
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise OCRError('Could not read this image. Use a valid JPEG, PNG, or WebP under 20 megapixels.') from exc
    try:
        result = subprocess.run(['tesseract', 'stdin', 'stdout', '-l', 'eng'], input=buffer.getvalue(), capture_output=True, timeout=30, check=True)
        sparse = subprocess.run(['tesseract', 'stdin', 'stdout', '-l', 'eng', '--psm', '11'], input=enhanced_buffer.getvalue(), capture_output=True, timeout=30, check=True)
    except subprocess.TimeoutExpired as exc:
        raise OCRError('OCR timed out. Try a smaller, clearer image.', 504) from exc
    except (subprocess.CalledProcessError, OSError) as exc:
        raise OCRError('OCR could not process this image. Check the Tesseract installation.', 503) from exc
    standard_text = result.stdout.decode('utf-8', errors='replace').strip()
    sparse_text = sparse.stdout.decode('utf-8', errors='replace').strip()
    if standard_text and sparse_text and standard_text != sparse_text:
        return f'Standard scan:\n{standard_text}\n\nAdditional scan:\n{sparse_text}'
    return standard_text or sparse_text

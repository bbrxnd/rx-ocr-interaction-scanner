"""Extract text from validated images using a shared local EasyOCR reader."""
import io
import os
import threading
import warnings
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000
MODEL_DIR = Path(__file__).resolve().parents[1] / '.cache' / 'easyocr'
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
_reader = None
_reader_lock = threading.Lock()


class OCRError(Exception):
    def __init__(self, message: str, status: int = 422):
        self.message, self.status = message, status


def _get_reader():
    global _reader
    if _reader is None:
        import certifi
        import easyocr
        # Python installations without a configured system CA store still verify downloads.
        os.environ.setdefault('SSL_CERT_FILE', certifi.where())
        _reader = easyocr.Reader(
            ['en'], gpu=False, model_storage_directory=str(MODEL_DIR),
            user_network_directory=str(MODEL_DIR), verbose=False,
        )
    return _reader


def extract_text(data: bytes) -> str:
    if not data or len(data) > MAX_BYTES:
        raise OCRError('Choose an image no larger than 10 MB.', 413 if data else 422)
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
                scale = min(2.0, 1600 / max(image.size))
                if scale != 1:
                    image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise OCRError('Could not read this image. Use a valid JPEG, PNG, or WebP under 20 megapixels.') from exc
    try:
        import numpy as np
        # Reader initialization and inference are serialized to avoid duplicate model downloads
        # and concurrent access to the shared model.
        with _reader_lock:
            lines = _get_reader().readtext(np.asarray(image), detail=0, paragraph=False)
    except Exception as exc:
        raise OCRError('EasyOCR could not process the image. Check the backend setup and model download.', 503) from exc
    return '\n'.join(line.strip() for line in lines if isinstance(line, str) and line.strip())

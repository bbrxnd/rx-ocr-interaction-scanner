import io

from fastapi.testclient import TestClient
from PIL import Image
from app.main import app
from app.ocr import MAX_BYTES

client = TestClient(app)


def image_bytes():
    output = io.BytesIO()
    Image.new('RGB', (100, 100), 'white').save(output, format='PNG')
    return output.getvalue()


def test_ocr_upload_returns_text(monkeypatch):
    class Reader:
        def readtext(self, image, **kwargs):
            assert image.shape == (200, 200, 3)
            return ['warfarin', 'aspirin']
    monkeypatch.setattr('app.ocr._get_reader', lambda: Reader())
    response = client.post('/api/ocr', files={'file': ('image.png', image_bytes(), 'image/png')})
    assert response.status_code == 200
    assert response.json() == {'text': 'warfarin\naspirin'}


def test_ocr_rejects_invalid_and_large_images():
    assert client.post('/api/ocr', files={'file': ('fake.png', b'not an image', 'image/png')}).status_code == 422
    assert client.post('/api/ocr', files={'file': ('big.png', b'x' * (MAX_BYTES + 1), 'image/png')}).status_code == 413


def test_engine_failure_is_explained(monkeypatch):
    def fail():
        raise RuntimeError('model download failed')
    monkeypatch.setattr('app.ocr._get_reader', fail)
    response = client.post('/api/ocr', files={'file': ('image.png', image_bytes(), 'image/png')})
    assert response.status_code == 503
    assert 'EasyOCR' in response.json()['detail']

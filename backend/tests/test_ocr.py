import io
from types import SimpleNamespace

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
    monkeypatch.setattr('app.ocr.shutil.which', lambda _: '/usr/bin/tesseract')
    monkeypatch.setattr('app.ocr.subprocess.run', lambda *args, **kwargs: SimpleNamespace(stdout=b'warfarin\naspirin\n'))
    response = client.post('/api/ocr', files={'file': ('image.png', image_bytes(), 'image/png')})
    assert response.status_code == 200
    assert response.json() == {'text': 'warfarin\naspirin'}


def test_ocr_rejects_invalid_and_large_images(monkeypatch):
    monkeypatch.setattr('app.ocr.shutil.which', lambda _: '/usr/bin/tesseract')
    assert client.post('/api/ocr', files={'file': ('fake.png', b'not an image', 'image/png')}).status_code == 422
    assert client.post('/api/ocr', files={'file': ('big.png', b'x' * (MAX_BYTES + 1), 'image/png')}).status_code == 413


def test_missing_engine_is_explained(monkeypatch):
    monkeypatch.setattr('app.ocr.shutil.which', lambda _: None)
    response = client.post('/api/ocr', files={'file': ('image.png', image_bytes(), 'image/png')})
    assert response.status_code == 503
    assert 'install Tesseract' in response.json()['detail']


def test_additional_pass_finds_large_label_text(monkeypatch):
    monkeypatch.setattr('app.ocr.shutil.which', lambda _: '/usr/bin/tesseract')
    calls = []
    def run(args, **kwargs):
        calls.append(args)
        return SimpleNamespace(stdout=b'ASPIRIN' if '--psm' in args else b'unclear text')
    monkeypatch.setattr('app.ocr.subprocess.run', run)
    response = client.post('/api/ocr', files={'file': ('image.png', image_bytes(), 'image/png')})
    assert response.status_code == 200
    assert 'unclear text' in response.json()['text']
    assert 'ASPIRIN' in response.json()['text']
    assert len(calls) == 2

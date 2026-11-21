from fastapi.testclient import TestClient

from app import explain
from app.main import app

client = TestClient(app)

PASSAGE = (
    "Ask a doctor or pharmacist before use if you are taking aspirin for heart attack "
    "or stroke, because ibuprofen may decrease this benefit of aspirin."
)
REQUEST = {
    "medications": ["Advil"],
    "evidence": [{"drug": "Advil", "section": "Ask a doctor or pharmacist", "text": PASSAGE}],
}


def fake_gemini(monkeypatch, *points, abstain=False):
    """Replace the Gemini call with a canned answer."""
    answer = explain.GeminiAnswer(
        abstain=abstain,
        points=[explain.GeminiPoint(text=t, evidence_id=e, quote=q) for t, e, q in points],
    )
    monkeypatch.setattr(explain, "call_gemini", lambda prompt: answer)


def test_point_with_real_quote_is_kept(monkeypatch):
    fake_gemini(monkeypatch, ("Ibuprofen can weaken aspirin.", "E1", "ibuprofen may decrease this benefit of aspirin"))
    body = client.post("/api/explain", json=REQUEST).json()
    assert body["status"] == "explained"
    assert body["dropped"] == 0
    assert body["points"][0]["section"] == "Ask a doctor or pharmacist"
    assert body["points"][0]["drug"] == "Advil"


def test_made_up_quote_is_dropped_and_we_abstain(monkeypatch):
    fake_gemini(monkeypatch, ("Advil is safe with aspirin.", "E1", "Advil is safe to take with aspirin"))
    body = client.post("/api/explain", json=REQUEST).json()
    assert body["status"] == "abstained"
    assert body["points"] == []
    assert body["dropped"] == 1


def test_citing_a_passage_that_does_not_exist_is_dropped(monkeypatch):
    fake_gemini(monkeypatch, ("Ibuprofen can weaken aspirin.", "E7", "ibuprofen may decrease this benefit of aspirin"))
    body = client.post("/api/explain", json=REQUEST).json()
    assert body["status"] == "abstained"
    assert body["dropped"] == 1


def test_model_choosing_to_abstain_is_respected(monkeypatch):
    fake_gemini(monkeypatch, abstain=True)
    body = client.post("/api/explain", json=REQUEST).json()
    assert body["status"] == "abstained"
    assert body["dropped"] == 0


def test_quote_check_ignores_spacing_capitals_and_wrapping_quotes():
    assert explain.quote_is_supported('"IBUPROFEN may  decrease\nthis benefit."', PASSAGE)
    assert not explain.quote_is_supported("ibuprofen ... aspirin", PASSAGE)  # "..." is not an exact quote
    assert not explain.quote_is_supported("aspirin", PASSAGE)  # too short to count as evidence


def test_missing_api_key_returns_503(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = client.post("/api/explain", json=REQUEST)
    assert response.status_code == 503

from fastapi.testclient import TestClient
from app.main import app
from app.providers import ProviderError

client = TestClient(app)


def test_supported_pair_and_order(monkeypatch):
    monkeypatch.setenv('AI_PROVIDER', 'demo')
    response = client.post('/api/evidence', json={'names': ['Aspirin', 'warfarin'], 'confirmed': True})
    assert response.status_code == 200
    body = response.json()
    assert [r['id'] for r in body['records']] == ['E001']
    assert body['uncovered'] == []
    assert body['explanation']['generated'] is False
    assert body['records'][0]['source']['url'].startswith('https://dailymed.nlm.nih.gov/')


def test_other_pair_and_partial_coverage(monkeypatch):
    monkeypatch.setenv('AI_PROVIDER', 'demo')
    body = client.post('/api/evidence', json={'names': ['warfarin', 'ibuprofen', 'lisinopril'], 'confirmed': True}).json()
    assert [r['id'] for r in body['records']] == ['E002']
    assert set(body['uncovered']) == {'warfarin + lisinopril', 'ibuprofen + lisinopril'}


def test_unknown_unconfirmed_and_duplicate_are_rejected():
    for payload in [
        {'names': ['warfarin', 'asprin'], 'confirmed': True},
        {'names': ['warfarin', 'aspirin'], 'confirmed': False},
        {'names': ['warfarin', 'warfarin'], 'confirmed': True},
        {'names': ['warfarin\naspirin', 'ibuprofen'], 'confirmed': True},
    ]:
        assert client.post('/api/evidence', json=payload).status_code == 422


def test_provider_failure_preserves_evidence(monkeypatch):
    def fail():
        raise ProviderError('Provider unavailable')
    monkeypatch.setattr('app.main.get_provider', fail)
    body = client.post('/api/evidence', json={'names': ['warfarin', 'aspirin'], 'confirmed': True}).json()
    assert body['records'][0]['id'] == 'E001'
    assert body['explanation'] is None
    assert body['explanation_error'] == 'Provider unavailable'

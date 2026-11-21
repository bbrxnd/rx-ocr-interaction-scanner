import asyncio

import httpx

from app.main import _find_fda_label, _format_label


def run(coro):
    return asyncio.run(coro)


def test_ingredient_match_returns_label_and_basis():
    label = {
        "id": "label-1",
        "effective_time": "20240101",
        "openfda": {"generic_name": ["ATORVASTATIN CALCIUM"], "brand_name": ["LIPITOR"]},
        "drug_interactions": ["Example interaction passage."],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["search"] == 'openfda.generic_name:"atorvastatin"'
        return httpx.Response(200, json={"results": [label]})

    async def lookup():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await _find_fda_label(client, ["atorvastatin"], "Lipitor 20 MG Oral Tablet")

    found, basis = run(lookup())
    assert found == label
    assert basis == "active ingredient"


def test_brand_fallback_used_when_no_ingredient_match():
    brand_label = {"id": "label-2", "openfda": {"brand_name": ["BRANDX"]}}
    unrelated_brand = {"id": "label-other", "openfda": {"brand_name": ["BRANDX PLUS"]}}
    requested = []

    def handler(request: httpx.Request) -> httpx.Response:
        search = request.url.params["search"]
        requested.append(search)
        if "generic_name" in search:
            return httpx.Response(200, json={"results": [{"id": "other", "openfda": {"generic_name": ["OTHER DRUG"]}}]})
        assert search == 'openfda.brand_name:"BrandX"'
        return httpx.Response(200, json={"results": [unrelated_brand, brand_label]})

    async def lookup():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await _find_fda_label(client, ["wanted drug"], "BrandX 10 MG Oral Tablet")

    found, basis = run(lookup())
    assert found == brand_label
    assert basis == "brand name"
    assert len(requested) == 2


def test_no_match_returns_none():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": {"code": "NOT_FOUND"}})

    async def lookup():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await _find_fda_label(client, ["unknown"], "")

    assert run(lookup()) == (None, None)


def test_format_label_preserves_available_evidence_and_metadata():
    result = _format_label(
        {
            "id": "label-3",
            "set_id": "set-3",
            "effective_time": "20240202",
            "openfda": {"generic_name": ["DRUG"], "manufacturer_name": ["Maker"]},
            "boxed_warning": ["Boxed passage."],
            "drug_interactions": ["Interaction passage."],
        },
        "active ingredient",
    )

    assert [item["section"] for item in result["sections"]] == ["Boxed warning", "Drug interactions"]
    assert [item["text"] for item in result["sections"]] == ["Boxed passage.", "Interaction passage."]
    assert result["metadata"]["effective_time"] == "20240202"
    assert result["metadata"]["set_id"] == "set-3"
    assert "label-3" in result["source_url"]

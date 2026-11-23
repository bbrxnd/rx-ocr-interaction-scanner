import asyncio

import httpx

from app.main import _find_fda_label, _format_label, _get_concept, _has_same_ingredients

NOT_FOUND = httpx.Response(404, json={"error": {"code": "NOT_FOUND"}})


def label(label_id, substances, effective_time="20240101", brand=None, route="ORAL", **sections):
    openfda = {"substance_name": substances, "route": [route]}
    if brand:
        openfda["brand_name"] = [brand]
    return {"id": label_id, "effective_time": effective_time, "openfda": openfda, **sections}


def find(handler, rxcui, ingredients, concept_name):
    async def lookup():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await _find_fda_label(client, rxcui, ingredients, concept_name)

    return asyncio.run(lookup())


def test_exact_product_rxcui_is_tried_first_and_newest_label_wins():
    newest = label("new", ["LISINOPRIL"], "20261111")
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.params["search"])
        assert request.url.params["sort"] == "effective_time:desc"
        return httpx.Response(200, json={"results": [newest, label("old", ["LISINOPRIL"], "20200101")]})

    found, basis = find(handler, "314076", ["lisinopril"], "lisinopril 10 MG Oral Tablet")
    assert found == newest
    assert basis == "exact product (RxCUI)"
    assert requests == ['openfda.rxcui:"314076"']


def test_ingredient_search_skips_combination_labels():
    combo = label("combo", ["LISINOPRIL", "HYDROCHLOROTHIAZIDE"], "20261201")
    plain = label("plain", ["LISINOPRIL"], "20261001")
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        search = request.url.params["search"]
        requests.append(search)
        if search.startswith("openfda.rxcui"):
            return NOT_FOUND
        return httpx.Response(200, json={"results": [combo, plain]})

    found, basis = find(handler, "29046", ["lisinopril"], "lisinopril")
    assert found == plain
    assert basis == "active ingredient"
    # "lisinopril" is an ingredient name, not a brand, so no brand search is made
    assert requests == ['openfda.rxcui:"29046"', 'openfda.generic_name:"lisinopril"']


def test_ingredient_search_prefers_labels_taken_by_mouth():
    gel = label("gel", ["DIPHENHYDRAMINE"], "20261201", route="TOPICAL")
    tablet = label("tablet", ["DIPHENHYDRAMINE HYDROCHLORIDE"], "20260101")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.params["search"].startswith("openfda.rxcui"):
            return NOT_FOUND
        return httpx.Response(200, json={"results": [gel, tablet]})

    found, _ = find(handler, "3498", ["diphenhydramine"], "diphenhydramine")
    assert found == tablet


def test_brand_concept_uses_brand_label_with_same_ingredients():
    advil_pm = label("pm", ["DIPHENHYDRAMINE HYDROCHLORIDE", "IBUPROFEN"], "20261201", brand="ADVIL PM")
    advil = label("advil", ["IBUPROFEN"], "20261103", brand="ADVIL")
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        search = request.url.params["search"]
        requests.append(search)
        if search.startswith("openfda.rxcui"):
            return NOT_FOUND
        assert search == 'openfda.brand_name:"Advil"'
        return httpx.Response(200, json={"results": [advil_pm, advil]})

    found, basis = find(handler, "153010", ["ibuprofen"], "Advil")
    assert found == advil
    assert basis == "brand name"
    assert len(requests) == 2


def test_no_match_returns_none():
    found = find(lambda request: NOT_FOUND, "999", ["unknown"], "")
    assert found == (None, None)


def test_same_ingredients_allows_salts_but_not_extra_ingredients():
    assert _has_same_ingredients(label("a", ["ATORVASTATIN CALCIUM TRIHYDRATE"]), ["atorvastatin"])
    assert not _has_same_ingredients(label("b", ["LISINOPRIL", "HYDROCHLOROTHIAZIDE"]), ["lisinopril"])
    # Without substance names, the generic name is split instead
    generic_only = {"id": "c", "openfda": {"generic_name": ["LISINOPRIL AND HYDROCHLOROTHIAZIDE"]}}
    assert not _has_same_ingredients(generic_only, ["lisinopril"])
    assert _has_same_ingredients(generic_only, ["hydrochlorothiazide", "lisinopril"])


def test_concept_ingredients_ignore_combination_products():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/properties.json"):
            return httpx.Response(200, json={"properties": {"rxcui": "29046", "name": "lisinopril", "tty": "IN"}})
        assert request.url.params["tty"] == "IN PIN"
        return httpx.Response(200, json={"relatedGroup": {"conceptGroup": [
            {"tty": "IN", "conceptProperties": [{"rxcui": "29046", "name": "lisinopril", "tty": "IN"}]},
            {"tty": "MIN", "conceptProperties": [{"rxcui": "1", "name": "hydrochlorothiazide / lisinopril", "tty": "MIN"}]},
        ]}})

    async def lookup():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await _get_concept(client, "29046", asyncio.Semaphore(1))

    concept = asyncio.run(lookup())
    assert [item["name"] for item in concept["ingredients"]] == ["lisinopril"]


def test_format_label_includes_otc_sections_and_dailymed_link():
    result = _format_label(
        {
            "id": "label-3",
            "set_id": "set-3",
            "effective_time": "20240202",
            "openfda": {"generic_name": ["DRUG"], "manufacturer_name": ["Maker"]},
            "boxed_warning": ["Boxed passage."],
            "drug_interactions": ["Interaction passage."],
            "ask_doctor_or_pharmacist": ["Ask if you are taking a blood thinner."],
        },
        "active ingredient",
    )

    assert [item["section"] for item in result["sections"]] == [
        "Boxed warning", "Drug interactions", "Ask a doctor or pharmacist before use",
    ]
    assert result["metadata"]["effective_time"] == "20240202"
    assert result["metadata"]["set_id"] == "set-3"
    assert result["source_url"] == "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=set-3"

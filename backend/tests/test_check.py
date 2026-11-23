from fastapi.testclient import TestClient

from app import main
from app.check import MAX_PASSAGE_CHARS, Medication, find_interactions, label_mentions, term_pattern

WARFARIN_LABEL = {
    "boxed_warning": ["WARNING: BLEEDING RISK. Warfarin can cause major or fatal bleeding."],
    "drug_interactions": [
        "Drugs that increase bleeding risk include antiplatelet agents and nonsteroidal "
        "anti-inflammatory drugs (NSAIDs). Monitor INR more often."
    ],
}
ADVIL_LABEL = {
    "warnings": [
        "Stomach bleeding warning: The chance is higher if you take a blood thinning (anticoagulant) or steroid drug."
    ],
    "ask_doctor_or_pharmacist": ["Ask a doctor or pharmacist before use if you are taking aspirin for heart attack or stroke."],
}


def med(name, ingredients, classes=(), label=None, brand=None, rxcui=None):
    return Medication(
        rxcui=rxcui or name,
        name=name,
        ingredients=list(ingredients),
        classes=list(classes),
        brand=brand,
        label=label,
        source_url=f"https://dailymed.example/{name}" if label else None,
    )


warfarin = med("warfarin", ["warfarin"], ["Vitamin K Antagonist"], WARFARIN_LABEL)
advil = med("Advil", ["ibuprofen"], ["Nonsteroidal Anti-inflammatory Drug"], ADVIL_LABEL, brand="Advil")


def test_term_pattern_matches_whole_words_plurals_and_hyphens():
    assert term_pattern("NSAID").search("other NSAIDs")
    assert term_pattern("beta blocker").search("beta-blockers")
    assert not term_pattern("statin").search("atorvastatin")
    assert not term_pattern("steroid").search("nonsteroidal")
    assert term_pattern("ARB").search("ARBs")
    assert not term_pattern("ARB").search("arbs")  # short abbreviations must be capitalized


def test_class_words_link_two_labels_in_both_directions():
    findings = label_mentions(warfarin, advil)
    assert findings[0]["section"] == "Drug interactions"
    assert findings[0]["severity"] == "moderate"
    assert "NSAID" in findings[0]["matched_terms"]
    # The passage is copied exactly from the label, so quotes can be checked later
    assert findings[0]["passage"] in WARFARIN_LABEL["drug_interactions"][0]

    reverse = label_mentions(advil, warfarin)
    assert reverse[0]["matched_terms"] == ["anticoagulant", "blood thinning"]
    assert reverse[0]["source_url"] == "https://dailymed.example/Advil"


def test_label_words_about_itself_are_not_counted():
    # An NSAID label talks about "NSAIDs" meaning itself, so that word cannot link it to naproxen
    nsaid_label = {"warnings": ["NSAIDs, except aspirin, increase the risk of heart attack."]}
    ibuprofen = med("ibuprofen", ["ibuprofen"], ["Nonsteroidal Anti-inflammatory Drug"], nsaid_label)
    naproxen = med("naproxen", ["naproxen"], ["Nonsteroidal Anti-inflammatory Drug"])
    assert label_mentions(ibuprofen, naproxen) == []

    [pair] = find_interactions([ibuprofen, naproxen])
    assert pair["shared"] == [{"kind": "drug_group", "value": "NSAID pain relievers"}]
    assert pair["status"] == "evidence_found"


def test_same_ingredient_is_flagged_without_searching_for_its_own_name():
    tylenol = med("Tylenol", ["acetaminophen"], label={"warnings": ["Acetaminophen may cause liver damage."]})
    nyquil = med("NyQuil", ["acetaminophen", "doxylamine"])
    [pair] = find_interactions([tylenol, nyquil])
    assert pair["findings"] == []
    assert pair["shared"] == [{"kind": "ingredient", "value": "acetaminophen"}]


def test_pair_with_nothing_found_is_no_evidence_not_safe():
    metformin = med("metformin", ["metformin"], label={"warnings": ["Lactic acidosis can occur."]})
    lisinopril = med("lisinopril", ["lisinopril"], ["Angiotensin Converting Enzyme Inhibitor"])
    [pair] = find_interactions([metformin, lisinopril])
    assert pair["status"] == "no_evidence_found"
    assert pair["highest_severity"] is None
    assert pair["labels_missing"] == ["lisinopril"]


def test_long_run_on_text_is_cut_to_an_exact_window_around_the_match():
    text = "word " * 400 + "avoid taking warfarin with this product " + "word " * 400
    label_med = med("other", ["other"], label={"warnings": [text]})
    [finding] = label_mentions(label_med, warfarin)
    assert len(finding["passage"]) <= MAX_PASSAGE_CHARS
    assert "warfarin" in finding["passage"]
    assert finding["passage"] in text


def test_repeated_otc_text_is_reported_once_from_the_specific_section():
    sentence = "Ask a doctor before use if you are taking a diuretic"
    label = {"ask_doctor": [sentence], "warnings": [f"Warnings Allergy alert: hives. {sentence}"]}
    nsaid = med("Motrin", ["ibuprofen"], ["Nonsteroidal Anti-inflammatory Drug"], label)
    hctz = med("hydrochlorothiazide", ["hydrochlorothiazide"], ["Thiazide Diuretic"])
    findings = label_mentions(nsaid, hctz)
    assert [finding["section"] for finding in findings] == ["Ask a doctor before use"]


def test_pairs_are_sorted_most_serious_first_and_numbered():
    boxed = med("oxycodone", ["oxycodone"], ["Opioid Agonist"],
                {"boxed_warning": ["Concomitant use with benzodiazepines may cause death."]})
    alprazolam = med("alprazolam", ["alprazolam"], ["Benzodiazepine"])
    pairs = find_interactions([warfarin, alprazolam, advil, boxed])
    assert pairs[0]["medications"] == ["alprazolam", "oxycodone"]
    assert pairs[0]["highest_severity"] == "high"
    assert pairs[-1]["status"] == "no_evidence_found"
    ids = [finding["id"] for pair in pairs for finding in pair["findings"]]
    assert ids == [f"F{number}" for number in range(1, len(ids) + 1)]


def test_check_endpoint_validates_and_returns_pairs(monkeypatch):
    loaded = {"1": (warfarin, {"source_url": "x", "sections": []}), "2": (advil, None)}

    async def fake_load(client, rxcui, semaphore):
        return loaded[rxcui]

    monkeypatch.setattr(main, "_load_medication", fake_load)
    client = TestClient(main.app)

    assert client.post("/api/check", json={"rxcuis": ["1", "1"]}).status_code == 422
    assert client.post("/api/check", json={"rxcuis": ["1", "abc"]}).status_code == 422

    response = client.post("/api/check", json={"rxcuis": ["1", "2"]})
    assert response.status_code == 200
    body = response.json()
    assert [m["name"] for m in body["medications"]] == ["warfarin", "Advil"]
    assert body["medications"][0]["drug_groups"] == ["blood thinners (anticoagulants)"]
    assert body["pairs"][0]["status"] == "evidence_found"

import asyncio
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.evidence import load_data, normalize, parse_names, retrieve
from app.providers import ProviderError, get_provider
from app.ocr import MAX_BYTES, OCRError, extract_text

load_dotenv(Path(__file__).resolve().parents[1] / '.env')
from .explain import router as explain_router

RXNORM_API = "https://rxnav.nlm.nih.gov/REST"
RXNORM_TIMEOUT_SECONDS = 10.0
MAX_CONCEPTS = 8
OPENFDA_API = "https://api.fda.gov/drug/label.json"
LABEL_SECTIONS = {
    "boxed_warning": "Boxed warning",
    "contraindications": "Contraindications",
    "warnings": "Warnings",
    "precautions": "Precautions",
    "drug_interactions": "Drug interactions",
    "adverse_reactions": "Adverse reactions",
}

app = FastAPI(
    title="Medication Interaction Explainer API",
    version="0.1.0",
)

app.include_router(explain_router)

@app.post('/api/ocr')
async def scan_image(file: UploadFile = File(...)) -> dict:
    """Extract text locally; the user must review it before use."""
    try:
        data = await file.read(MAX_BYTES + 1)
        text = await run_in_threadpool(extract_text, data)
    except OCRError as error:
        raise HTTPException(status_code=error.status, detail=error.message) from error
    finally:
        await file.close()
    return {'text': text}


class EvidenceRequest(BaseModel):
    names: list[str] = Field(min_length=2, max_length=6)
    confirmed: bool


@app.post('/api/evidence')
def medication_evidence(request: EvidenceRequest) -> dict:
    """Compare confirmed, exact catalog ingredients against curated evidence."""
    if not request.confirmed:
        raise HTTPException(status_code=422, detail='Confirm the ingredient list before continuing.')
    if any('\n' in name or '\r' in name for name in request.names):
        raise HTTPException(status_code=422, detail='Enter one ingredient per item.')
    try:
        names = parse_names('\n'.join(request.names))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    data = load_data()
    medications, unknown = normalize(names, data)
    if unknown:
        raise HTTPException(status_code=422, detail='Unrecognized ingredients: ' + ', '.join(unknown))
    records, uncovered = retrieve(medications, data)
    explanation = None
    error = None
    if records:
        try:
            result = get_provider().explain(records)
            explanation = {'findings': result.findings, 'label': result.label, 'generated': result.generated}
        except ProviderError as exc:
            error = str(exc)
    return {'medications': medications, 'records': records, 'uncovered': uncovered,
            'explanation': explanation, 'explanation_error': error}


async def _rxnorm_get(
    client: httpx.AsyncClient,
    path: str,
    params: dict[str, str] | None = None,
) -> dict:
    response = await client.get(f"{RXNORM_API}{path}", params=params)
    response.raise_for_status()
    return response.json()


async def _openfda_get(client: httpx.AsyncClient, search: str) -> dict:
    response = await client.get(
        OPENFDA_API,
        params={"search": search, "limit": "25"},
    )
    response.raise_for_status()
    return response.json()


def _label_values(label: dict, field: str) -> list[str]:
    values = label.get(field, [])
    if isinstance(values, str):
        values = [values]
    return [value for value in values if isinstance(value, str) and value.strip()]


def _matching_labels(labels: list[dict], ingredients: list[str]) -> list[dict]:
    normalized_ingredients = [value.casefold().strip() for value in ingredients if value.strip()]
    matches = []
    for label in labels:
        generic_names = _label_values(label.get("openfda", {}), "generic_name")
        matched = [
            ingredient for ingredient in normalized_ingredients
            if any(ingredient in generic_name.casefold() for generic_name in generic_names)
        ]
        if matched:
            matches.append((len(matched), label))
    matches.sort(key=lambda item: item[0], reverse=True)
    return [label for _, label in matches]


def _brand_search_term(concept_name: str) -> str:
    """Remove strength and dosage-form text from a branded RxNorm name."""
    strength = re.search(
        r"\s+\d+(?:\.\d+)?\s*(?:mg|mcg|μg|ug|g|kg|ml|mL|l|meq|iu|units?|%)\b",
        concept_name,
        flags=re.IGNORECASE,
    )
    return concept_name[:strength.start()].strip() if strength else concept_name.strip()


def _brand_matches_concept(label: dict, concept_name: str) -> bool:
    normalized_concept = concept_name.casefold().strip()
    return any(
        normalized_concept == name.casefold().strip()
        or normalized_concept.startswith(name.casefold().strip() + " ")
        for name in _label_values(label.get("openfda", {}), "brand_name")
        if name.strip()
    )


async def _find_fda_label(
    client: httpx.AsyncClient,
    ingredients: list[str],
    brand_name: str,
) -> tuple[dict | None, str | None]:
    candidates: list[dict] = []
    for ingredient in ingredients:
        query_term = ingredient.replace('"', r'\"')
        try:
            result = await _openfda_get(
                client,
                f'openfda.generic_name:"{query_term}"',
            )
        except httpx.HTTPStatusError as error:
            if error.response.status_code == 404:
                continue
            raise
        candidates.extend(result.get("results", []))

    unique_candidates = {label.get("id"): label for label in candidates if label.get("id")}
    matching = _matching_labels(list(unique_candidates.values()), ingredients)
    if matching:
        return matching[0], "active ingredient"

    search_brand = _brand_search_term(brand_name)
    if search_brand:
        query_term = search_brand.replace('"', r'\"')
        try:
            result = await _openfda_get(
                client,
                f'openfda.brand_name:"{query_term}"',
            )
        except httpx.HTTPStatusError as error:
            if error.response.status_code == 404:
                return None, None
            raise
        brand_candidates = [
            label for label in result.get("results", [])
            if _brand_matches_concept(label, brand_name)
        ]
        if brand_candidates:
            return brand_candidates[0], "brand name"
    return None, None


def _format_label(label: dict, match_basis: str) -> dict:
    sections = []
    for field, title in LABEL_SECTIONS.items():
        for passage in _label_values(label, field):
            sections.append({"section": title, "text": passage})

    openfda = label.get("openfda", {})
    label_id = label.get("id")
    return {
        "match_basis": match_basis,
        "metadata": {
            "brand_name": openfda.get("brand_name", []),
            "generic_name": openfda.get("generic_name", []),
            "manufacturer_name": openfda.get("manufacturer_name", []),
            "effective_time": label.get("effective_time"),
            "set_id": label.get("set_id"),
            "id": label_id,
        },
        "source_url": f"https://api.fda.gov/drug/label.json?search=id:%22{label_id}%22" if label_id else OPENFDA_API,
        "sections": sections,
    }


async def _get_concept(
    client: httpx.AsyncClient,
    rxcui: str,
    semaphore: asyncio.Semaphore,
) -> dict:
    async with semaphore:
        properties_result, related_result = await asyncio.gather(
            _rxnorm_get(client, f"/rxcui/{rxcui}/properties.json"),
            _rxnorm_get(
                client,
                f"/rxcui/{rxcui}/related.json",
                {"tty": "IN MIN PIN"},
            ),
        )

    properties = properties_result.get("properties")
    if not properties:
        raise ValueError(f"RxNorm returned no properties for RxCUI {rxcui}.")

    ingredients = []
    for group in related_result.get("relatedGroup", {}).get("conceptGroup", []):
        if group.get("tty") in {"IN", "MIN", "PIN"}:
            ingredients.extend(group.get("conceptProperties", []))

    unique_ingredients = {
        ingredient["rxcui"]: ingredient
        for ingredient in ingredients
        if ingredient.get("rxcui")
    }
    return {
        **properties,
        "ingredients": list(unique_ingredients.values()),
    }


async def _search_rxnorm(name: str) -> list[dict]:
    timeout = httpx.Timeout(RXNORM_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout, headers={"Accept": "application/json"}) as client:
        exact_result = await _rxnorm_get(
            client,
            "/rxcui.json",
            {"name": name, "search": "2", "allsrc": "0"},
        )
        rxcuis = exact_result.get("idGroup", {}).get("rxnormId", [])

        if not rxcuis:
            approximate_result = await _rxnorm_get(
                client,
                "/approximateTerm.json",
                {"term": name, "maxEntries": "10", "option": "1"},
            )
            candidates = approximate_result.get("approximateGroup", {}).get("candidate", [])
            rxcuis = list(dict.fromkeys(
                candidate["rxcui"]
                for candidate in candidates
                if candidate.get("rxcui")
            ))

        semaphore = asyncio.Semaphore(4)
        concept_results = await asyncio.gather(
            *(
                _get_concept(client, rxcui, semaphore)
                for rxcui in rxcuis[:MAX_CONCEPTS]
            ),
            return_exceptions=True,
        )

    concepts = [result for result in concept_results if isinstance(result, dict)]
    if concept_results and not concepts:
        first_error = next(
            (result for result in concept_results if isinstance(result, Exception)),
            None,
        )
        if first_error:
            raise first_error
    return concepts


@app.get("/api/health")
def health() -> dict:
    """Check that the backend is running."""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/rxnorm/search")
async def search_rxnorm(name: str = Query(..., min_length=1, max_length=200)) -> dict:
    """Find RxNorm concepts for a medication name and include related ingredients."""
    medication_name = name.strip()
    if not medication_name:
        raise HTTPException(status_code=422, detail="Medication name cannot be blank.")

    try:
        concepts = await _search_rxnorm(medication_name)
    except httpx.TimeoutException as error:
        raise HTTPException(status_code=504, detail="RxNorm did not respond in time.") from error
    except httpx.HTTPStatusError as error:
        raise HTTPException(
            status_code=502,
            detail=f"RxNorm returned HTTP {error.response.status_code}.",
        ) from error
    except (httpx.RequestError, ValueError) as error:
        raise HTTPException(status_code=502, detail="Could not retrieve results from RxNorm.") from error

    return {"concepts": concepts}


@app.get("/api/fda/label")
async def get_fda_label(rxcui: str = Query(..., min_length=1, max_length=20)) -> dict:
    """Find FDA labeling for a selected RxNorm concept and return source passages."""
    timeout = httpx.Timeout(RXNORM_TIMEOUT_SECONDS)
    try:
        async with httpx.AsyncClient(timeout=timeout, headers={"Accept": "application/json"}) as client:
            concept = await _get_concept(client, rxcui, asyncio.Semaphore(1))
            ingredients = [
                item["name"] for item in concept.get("ingredients", [])
                if item.get("name")
            ]
            label, match_basis = await _find_fda_label(client, ingredients, concept.get("name", ""))
    except httpx.TimeoutException as error:
        raise HTTPException(status_code=504, detail="FDA or RxNorm did not respond in time.") from error
    except httpx.HTTPStatusError as error:
        raise HTTPException(
            status_code=502,
            detail=f"FDA or RxNorm returned HTTP {error.response.status_code}.",
        ) from error
    except (httpx.RequestError, ValueError) as error:
        raise HTTPException(status_code=502, detail="Could not retrieve the FDA label.") from error

    if label is None or match_basis is None:
        return {"matched": False, "rxcui": rxcui, "label": None}
    return {
        "matched": True,
        "rxcui": rxcui,
        "label": _format_label(label, match_basis),
    }

import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException, Query

RXNORM_API = "https://rxnav.nlm.nih.gov/REST"
RXNORM_TIMEOUT_SECONDS = 10.0
MAX_CONCEPTS = 8

app = FastAPI(
    title="Medication Interaction Explainer API",
    version="0.1.0",
)


async def _rxnorm_get(
    client: httpx.AsyncClient,
    path: str,
    params: dict[str, str] | None = None,
) -> dict:
    response = await client.get(f"{RXNORM_API}{path}", params=params)
    response.raise_for_status()
    return response.json()


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

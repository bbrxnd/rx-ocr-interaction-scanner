# explanation of FDA label passages

import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field, ValidationError

load_dotenv(Path(__file__).resolve().parent.parent / ".env")  # reads backend/.env

MAX_PASSAGE_CHARS = 3000  # long sections (e.g. adverse reactions) get cut so the prompt stays small

SYSTEM_PROMPT = """You explain FDA drug label passages to family caregivers of older adults.

Rules:
- Use ONLY the numbered passages you are given. Do not add facts from your own knowledge.
- Write each point as one or two short sentences at an 8th-grade reading level. Explain medical words in plain language.
- Every point must cite exactly one passage by its id (like "E2") and copy a short quote (5 to 30 words) from that passage exactly, character for character. Do not shorten the quote with "...".
- Focus on what a caregiver should watch for or ask about: serious warnings, who should not take the medicine, and interactions with other medicines, foods, or alcohol.
- Never say a medicine or combination is "safe". Never tell anyone to start, stop, or change a medicine or dose; say to ask their doctor or pharmacist instead.
- Give at most 6 points, most important first.
- If the passages contain nothing a caregiver needs to know, set abstain to true and return no points."""

router = APIRouter()


# ---- What the frontend sends ----

class EvidencePassage(BaseModel):
    drug: str = Field(min_length=1, max_length=200)    # which medication's label this came from
    section: str = Field(min_length=1, max_length=100)  # e.g. "Drug interactions"
    text: str = Field(min_length=1)                     # the label passage itself


class ExplainRequest(BaseModel):
    medications: list[str] = Field(min_length=1, max_length=10)
    evidence: list[EvidencePassage] = Field(min_length=1, max_length=40)


# ---- What Gemini must return (enforced with a JSON schema) ----

class GeminiPoint(BaseModel):
    text: str         # plain-language explanation
    evidence_id: str  # passage it is based on, e.g. "E2"
    quote: str        # exact words copied from that passage


class GeminiAnswer(BaseModel):
    abstain: bool
    points: list[GeminiPoint]


# ---- What we send back to the frontend ----

class ExplainedPoint(BaseModel):
    text: str
    quote: str
    evidence_id: str
    drug: str
    section: str


class ExplainResponse(BaseModel):
    status: Literal["explained", "abstained"]
    points: list[ExplainedPoint]
    dropped: int  # points removed because their quote was not found in the cited passage
    model: str


def model_name() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

def _normalize(text: str) -> str:
    return " ".join(text.split()).casefold()


def quote_is_supported(quote: str, passage: str) -> bool:
    """True if the quote really appears in the passage (ignoring spacing and capitals)."""
    cleaned = _normalize(quote).strip(" \"'“”‘’.")
    return len(cleaned) >= 10 and cleaned in _normalize(passage)


def build_prompt(request: ExplainRequest) -> tuple[str, dict[str, EvidencePassage]]:
    """Number the passages E1, E2, ... so Gemini can cite them."""
    passages = {f"E{i}": passage for i, passage in enumerate(request.evidence, start=1)}
    blocks = [
        f"[{pid}] {p.drug} label, {p.section}:\n{p.text[:MAX_PASSAGE_CHARS]}"
        for pid, p in passages.items()
    ]
    prompt = f"Medications: {', '.join(request.medications)}\n\nPassages:\n\n" + "\n\n".join(blocks)
    return prompt, passages


def call_gemini(prompt: str) -> GeminiAnswer:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Explanations are turned off: GEMINI_API_KEY is not set in backend/.env.",
        )
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model_name(),
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=GeminiAnswer,
            temperature=0.2,
        ),
    )
    if isinstance(response.parsed, GeminiAnswer):
        return response.parsed
    return GeminiAnswer.model_validate_json(response.text or "")


@router.post("/api/explain")
def explain(request: ExplainRequest) -> ExplainResponse:
    """Explain label passages in plain language, keeping only points backed by an exact quote."""
    prompt, passages = build_prompt(request)
    try:
        answer = call_gemini(prompt)
    except ValidationError:
        answer = GeminiAnswer(abstain=True, points=[])  # reply didn't match the schema, so abstain
    except errors.APIError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini returned an error ({error.code}): {error.message}",
        ) from error

    kept: list[ExplainedPoint] = []
    if not answer.abstain:
        for point in answer.points:
            evidence_id = point.evidence_id.strip().strip("[]")
            source = passages.get(evidence_id)
            if source and quote_is_supported(point.quote, source.text):
                kept.append(ExplainedPoint(
                    text=point.text,
                    quote=point.quote,
                    evidence_id=evidence_id,
                    drug=source.drug,
                    section=source.section,
                ))

    return ExplainResponse(
        status="explained" if kept else "abstained",
        points=kept,
        dropped=0 if answer.abstain else len(answer.points) - len(kept),
        model=model_name(),
    )

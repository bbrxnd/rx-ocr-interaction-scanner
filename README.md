# Medication Interaction Explainer

**CECS 458/558, Fall 2026 - Team 10:** Roger Carrillo, Brandon Chu, Nhan Nguyen, David Ramos

A web app that helps family caregivers check a loved one's medication list. Each medication is matched
to its RxNorm entry, every pair is checked against the warnings in the official FDA drug labels, and
every warning quotes the exact label sentence it is based on. Gemini can then explain those sentences in
plain language, but it never decides whether an interaction exists.

> Educational prototype, not clinically reviewed and not medical advice. Discuss concerns with a
> pharmacist or prescriber.

## Feature Plan

- [x] Project skeleton (React + FastAPI)
- [x] RxNorm drug search and FDA label lookup
- [x] Gemini plain-language explanations, checked against exact label quotes
- [x] Medication list and interaction check for any drugs (`/api/check`)
- [x] Photo scanning (EasyOCR) that feeds the RxNorm search
- [ ] Evaluation: interaction accuracy, OCR accuracy, explanation quality
- [ ] Allergy and food checks

## How it works

1. **Add medications.** Type a name or scan a pill bottle photo. EasyOCR reads the photo on the
   backend, you choose the line with the drug name, and the RxNorm search finds matching products.
   You pick the right one, so nothing is added without your confirmation.
2. **Check for interactions.** For each medication, the backend gets its ingredients (RxNorm), its drug
   class (RxClass, e.g. "Nonsteroidal Anti-inflammatory Drug"), and its newest FDA label (openFDA).
   For every pair, it searches each label's risk sections for the other drug's ingredient, brand name,
   or class words, because labels often say "NSAIDs" instead of "ibuprofen". Each match is shown as the
   exact label sentence with its section, a severity (boxed warning, contraindication, or "Do not use"
   count as serious), and a DailyMed link. Pairs with the same ingredient or the same type of medicine
   are also flagged. Pairs with nothing found are reported as "no label warnings found", never as safe.
3. **Explain in plain language.** Gemini rewrites only the sentences that were found. Every point must
   quote the label; a point whose quote is not found word for word in the label is dropped, and if no
   points remain the app says it cannot explain instead of guessing.

## Run instructions

Use two terminals: one for the backend and one for the frontend.

### Backend (Python 3.11)
```powershell
cd backend
py -3.11 -m venv .venv          # macOS/Linux: python3.11 -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
API docs: http://localhost:8000/docs

To turn on the "Explain in plain language" button, copy `backend/.env.example` to `backend/.env` and
add a free Gemini API key from https://aistudio.google.com/apikey. Never commit `.env`.

### Frontend (Node 20.19 or newer)
```powershell
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

## API endpoints

| Endpoint | What it does |
|---|---|
| `GET /api/rxnorm/search?name=` | RxNorm matches (exact, then approximate) with their ingredients |
| `GET /api/fda/label?rxcui=` | Newest FDA label: exact product first, then brand, then same ingredients |
| `POST /api/check` | Checks every pair in a list of 2–10 RxCUIs against their FDA labels |
| `POST /api/explain` | Plain-language explanation of label passages, with quote checking |
| `POST /api/ocr` | Reads text from a JPEG, PNG, or WebP photo with EasyOCR |
| `POST /api/evidence` | Earlier curated two-pair prototype, kept for reference (not used by the page) |
| `GET /api/health` | Health check |

### Tests and checks
- Backend: `python -m pytest -q` from `backend/`
- Frontend: `npm run lint` and `npm run build` from `frontend/`

## Limits
- Finds only interactions that a label mentions by drug name or by a drug class in our word list; labels do not list every interaction.
- Does not consider doses, timing, food, allergies, or patient-specific factors yet.
- Needs internet access for RxNorm, RxClass, openFDA, and Gemini.
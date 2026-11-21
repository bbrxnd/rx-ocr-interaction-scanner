# Medication Interaction Explainer

**CECS 458/558, Fall 2026 - Team 10:** Roger Carrillo, Brandon Chu, Nhan Nguyen, David Ramos

App that helps check a loved one's medications for drug–drug, drug–food and allergy concerns. Medication is matched to its RxNorm entry, warnings come from FDA drug label text, and every warning quotes the label
passage it is based on.

## Feature Plan

- [x] Project skeleton
- [x] RxNorm drug search and FDA label lookup (one medication at a time)
- [x] Gemini explanations of individual FDA label passages, checked against label quotes
- [ ] Medication list and interaction check — initial prototype covering two pairs
- [ ] Photo scanning (OCR) — initial local prototype with manual review
- [ ] Allergy and food checks

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

To turn on the "Explain in plain language" button, copy `backend/.env.example` to `backend/.env`
and add a free Gemini API key from https://aistudio.google.com/apikey. Run the tests with `pytest` from `backend/`.


### Frontend (Node 20.19 or newer)
```powershell
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

## Review the two-pair MVP

The React app includes a curated, ingredient-level comparison alongside the live RxNorm and FDA label lookup. Enter 2–6 exact generic ingredient names, review and confirm the list, then select **Find evidence and explain**. Try the supported example (warfarin and aspirin), or warfarin and ibuprofen. The coverage example (aspirin and lisinopril) shows how unsupported pairs are reported. Recognized names are warfarin, aspirin, ibuprofen, acetaminophen, and lisinopril. Only the first two pairs have curated evidence; missing evidence does not establish safety.

For pair review, the default explanation is a prepared demo summary, not an AI-generated response. The separate individual-label lookup has its own Gemini explanation button. To use an optional model, copy `backend/.env.example` to `backend/.env` and configure `AI_PROVIDER`, `AI_BASE_URL`, and `AI_MODEL`; set `AI_API_KEY` if the compatible provider requires it. Supported providers are `demo`, `ollama`, and an OpenAI-compatible chat service. Restart the backend after changes. Provider failures leave the source evidence visible. Citation validation checks the response format and IDs, not clinical accuracy.

The pair review uses a bundled DailyMed excerpt, not live FDA label matching. The separate lookup below it uses live RxNorm and openFDA services and requires internet access. The pair review does not evaluate doses, formulations, food, allergies, or patient-specific factors. This educational prototype is not clinically reviewed; discuss concerns with a pharmacist or prescriber.

Run backend tests with `cd backend && .venv/bin/python -m pytest -q`; run frontend checks with `cd frontend && npm run build && npm run lint`.

## Scan a photo

Install Tesseract with English language data and make `tesseract` available on the backend's PATH (on macOS with Homebrew: `brew install tesseract`). Install the Python requirements again after updating. Restart the backend, choose one or more JPEG, PNG, or WebP images under 10 MB and 20 megapixels each, and select **Extract text**. Compare the editable text with each photo, select correct suggested ingredients, and add them to the medication list. Manually enter missing names, then confirm the complete list. Suggestions use exact matches against the five supported generic ingredients; they can miss medicines or match unrelated text. Nothing is added without your selection.

The backend processes images locally using Tesseract, using a standard scan and a resized sparse-text scan, each with a 30-second timeout. Uploaded files may be temporarily spooled by the web server during the request and are closed afterward; the app does not retain them. Do not use real prescription photos for shared testing. Recognition varies with image quality, layout, and handwriting. This initial implementation uses English OCR; it does not support HEIC or PDF.

# Medication Interaction Explainer

**CECS 458/558, Fall 2026 - Team 10:** Roger Carrillo, Brandon Chu, Nhan Nguyen, David Ramos

App that helps check a loved one's medications for drug–drug, drug–food and allergy concerns. Medication is matched to its RxNorm entry, warnings come from FDA drug label text, and every warning quotes the label
passage it is based on.

## Feature Plan

- [x] Project skeleton
- [x] RxNorm drug search
- [x] FDA label lookup (one medication at a time)
- [x] Gemini plain-language explanations, checked against label quotes
- [ ] Medication list + drug–drug interaction check
- [ ] Photo scanning (OCR)
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

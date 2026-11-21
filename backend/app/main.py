from fastapi import FastAPI
from datetime import datetime, timezone

# uvicorn main:app --reload
app = FastAPI(
    title="Medication Interaction Explainer API",
    version="0.1.0",
)


@app.get("/api/health")
def health() -> dict:
    """check that the backend is running."""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

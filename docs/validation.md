# MVP validation

Verified November 19, 2026 on Python 3.13.5 with the pinned dependencies.

- Automated suite: 14 passing tests covering input limits, exact matching, missing and partial coverage, TF-IDF ranking, provider formats, citation rejection, timeouts, confirmation, input invalidation, and session reset.
- Real local inference: Ollama `llama3:latest` successfully explained the warfarin + aspirin example, returned E001, and described the label's increased bleeding concern. No API key or cloud model was used. This is one functional example, not a clinical accuracy measurement.
- Browser verification: completed the same flow through the running Streamlit interface, including confirmation, generated output, evidence passage, and DailyMed link.
- Both the demo and provider errors remain labeled; an external compatible provider was tested with simulated responses only.

Remaining evaluation: repeat the flow with the full supported pair set, record provider latency and consistency across repeated runs, compare generated claims to every source passage, and arrange clinical review before extending coverage. OCR and live normalization are not implemented.

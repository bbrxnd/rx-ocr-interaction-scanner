# Milestone 2 MVP plan

Team 5: Roger Carrillo, Brandon Chu, Nhan Nguyen, David Ramos.

Implementation update, November 19: the first manual-entry flow now runs with a bundled five-ingredient catalog and two label-backed records. Demo, local Ollama, and compatible-provider adapters are implemented; local `llama3:latest` inference has been verified. See the README and [validation notes](validation.md). The scope and assignments below remain the original proposal; they are not a claim that all planned work is complete.

Build one working medication evidence explanation flow before expanding to OCR. Phase 2 is due November 20, 2026 at 11:59 p.m.; the final submission is due December 11. Scope and work assignments below are proposals. At review on November 19, the repository contained only a README; implementation and evaluation remain to be done.

## First release

Manual medication entry → normalized candidates → user confirmation → reviewed evidence lookup → actual LLM explanation → results with sources and coverage limits.

- Start with 5–10 supported medications and a small set of explicitly reviewed drug-pair records. Publish the supported set.
- Require confirmation of medication identity. Do not silently choose ambiguous candidates or infer missing strength or formulation.
- Match confirmed ingredient identifiers against the reviewed records. Each record needs an evidence ID, both ingredient IDs, exact source passage, label title, section, URL, label version or update date, and retrieval date.
- Give the model only relevant evidence and confirmed medication information. Require evidence IDs for claims. Render links from stored records, not model-generated URLs. Reject references to unknown evidence IDs; manually review whether explanations actually follow the passages.
- If evidence is missing, show “Outside prototype coverage; this result does not establish safety.” Model or network failures must preserve accessible source passages and show that explanation generation failed.
- Keep inputs in the current session, use synthetic examples, and keep credentials in environment variables. No patient names or prescription photos are needed for the first release.
- Defer OCR, comprehensive allergy and food checks, accounts, persistent patient profiles, and deployment. Record this reduction from Phase 1 explicitly in the progress report.

This is a bounded educational prototype. It must not recommend medication changes or claim comprehensive interaction screening.

## Proposed implementation

Use a single Python Streamlit application for the first flow, unless the team already has a preferred stack. A small JSON evidence collection avoids database setup. Use RxNorm for normalization and an available LLM API for explanation. The Phase 1 proposal suggested Gemini; confirm provider access before choosing the model and dependency versions.

Proposed files, not yet implemented:

- `app.py`: entry, confirmation, results, and reset.
- `services/normalization.py`: RxNorm requests, candidate mapping, errors.
- `services/evidence.py`: exact matching against supported evidence records.
- `services/explanation.py`: prompt, provider call, response checks, fallback.
- `data/evidence.json`: reviewed records with provenance.
- `tests/`: normalization ambiguity, evidence matching, model response checks, and failure behavior.
- `.env.example`, dependency file, and README: setup and sample reproduction.

No vector database is necessary for this small collection. Exact retrieval followed by evidence-conditioned generation demonstrates the intended workflow with fewer integration dependencies.

## Workstreams and integration order

Choose one owner per workstream from the four team members. These are proposed responsibilities, not a record of completed contributions.

1. Interface: medication entry, candidate confirmation, evidence and explanation display.
2. Data and normalization: RxNorm mapping, supported medication list, reviewed evidence records and provenance.
3. AI and integration: provider setup, evidence-only prompt, citation checks, error handling, complete input-to-output flow.
4. Validation and submission: test cases, recorded results, setup verification, architecture documentation, two-page progress report.

First agree on the medication, evidence, and explanation formats. Then connect one real supported example across all components and merge it. Expand coverage only after that example works. Avoid developing disconnected screens and services until the final hour.

Before submission, reserve time to run the prototype from a fresh setup and write the report from observed behavior. If incomplete, describe the implemented PoC honestly rather than presenting planned components as finished.

## Acceptance checks

- A teammate can install, configure, launch, and reproduce one result using only the README.
- A supported pair retrieves the intended record and produces a real model explanation with traceable citations.
- Ambiguous names require confirmation; unknown medications and unsupported pairs do not produce reassurance.
- API timeout, malformed model response, and invalid citation IDs produce explicit fallback behavior.
- Editing medication inputs invalidates the previous result.
- The report records actual sample inputs, outputs, failures, and counts. Do not claim clinical accuracy from a handful of examples.

## Submission checklist

Phase 2 requires technical documentation in the GitHub repository and a progress report of at most two pages, including the repository URL. Submit through the course Canvas Dropbox.

- Repository: dependencies, configuration, run command, reproducible sample, main-file explanation, architecture/workflow diagram, limitations.
- AI documentation: chosen model, prompt, API workflow, input/output behavior, limitations, and the team's own contribution.
- Report: objective/current scope, completed features, architecture/workflow diagram, data and model/algorithm, preliminary results, limitations, remaining tasks, and each member's current responsibility.
- Keep all secrets out of code, screenshots, reports, and version history. Supply configuration names and placeholders only.

Phase 2 scoring: implementation 9 points, AI integration 8, PoC-to-MVP progression 7, reproducibility 4, design decisions 2. Prioritize a demonstrable flow over additional screens.

## Repository workflow

Use this existing repository. Contributors with write access create short feature branches and open pull requests into `main`; contributors without write access fork it and open pull requests back to this repository. A separate unrelated repo adds avoidable integration work.

Suggested branches: `feat/manual-entry`, `feat/evidence-data`, `feat/evidence-explainer`, `docs/setup-and-results`. Keep pull requests small and record each member's contributions. Do not commit credentials, real prescription photos, or generated local environment files.

## Data feasibility and sources

RxNorm normalizes drug names; it is not the interaction engine. NLM discontinued RxNav's interaction features on January 2, 2024. DailyMed supplies label documents, not a ready-made exhaustive pairwise interaction checker. For this deadline, use a reviewed, explicitly bounded collection of label-derived records; do not invent interaction records or infer safety from a missing match.

- Course requirements: `Term_project-1.pdf`, Phase 2 requirements on PDF pages 2–3 and rubric on page 4, in the parent Final Project folder.
- Original scope: `annotated-CECS%20458%20-%20Phase%201.pdf`, in the parent Final Project folder.
- [NLM RxNav FAQ](https://lhncbc.nlm.nih.gov/RxNav/information/FAQs.html): interaction service discontinuation.
- [DailyMed web services](https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm): label retrieval and version history.
- [openFDA label API](https://open.fda.gov/apis/drug/label/): label data scope and responsible use.

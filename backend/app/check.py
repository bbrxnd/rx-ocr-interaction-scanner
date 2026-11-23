# Find FDA label passages where one medication's label mentions another medication on the list.

import re
from dataclasses import dataclass, field
from itertools import combinations

MAX_PASSAGE_CHARS = 700     # long sentences are cut to a window around the match
MAX_FINDINGS_PER_LABEL = 4  # per (label, other medication), most serious sections first

# Label sections that describe risks, most serious first: field -> (title, severity)
CHECKED_SECTIONS = {
    "boxed_warning": ("Boxed warning", "high"),
    "contraindications": ("Contraindications", "high"),
    "do_not_use": ("Do not use", "high"),
    "drug_interactions": ("Drug interactions", "moderate"),
    "ask_doctor_or_pharmacist": ("Ask a doctor or pharmacist before use", "moderate"),
    "ask_doctor": ("Ask a doctor before use", "moderate"),
    "when_using": ("When using this product", "moderate"),
    "stop_use": ("Stop use and ask a doctor", "moderate"),
    "warnings_and_cautions": ("Warnings and precautions", "moderate"),
    "warnings": ("Warnings", "moderate"),
    "precautions": ("Precautions", "moderate"),
}
SEVERITY_RANK = {"high": 0, "moderate": 1}

# Labels often name a drug class ("NSAIDs", "anticoagulants") instead of each drug.
# Each group links FDA drug classes (from RxClass) to the words labels use for them.
DRUG_GROUPS = {
    "blood thinners (anticoagulants)": (
        ["Vitamin K Antagonist", "Factor Xa Inhibitor", "Direct Thrombin Inhibitor"],
        ["anticoagulant", "anticoagulation", "blood thinner", "blood thinning", "thinning the blood"],
    ),
    "antiplatelet medicines": (
        ["Platelet Aggregation Inhibitor", "P2Y12 Platelet Inhibitor"],
        ["antiplatelet", "platelet inhibitor", "platelet aggregation inhibitor"],
    ),
    "NSAID pain relievers": (
        ["Nonsteroidal Anti-inflammatory Drug"],
        ["NSAID", "nonsteroidal anti-inflammatory", "non-steroidal anti-inflammatory"],
    ),
    "ACE inhibitors": (
        ["Angiotensin Converting Enzyme Inhibitor"],
        ["ACE inhibitor", "angiotensin converting enzyme inhibitor"],
    ),
    "angiotensin receptor blockers (ARBs)": (
        ["Angiotensin 2 Receptor Blocker"],
        ["ARB", "angiotensin receptor blocker", "angiotensin II receptor blocker"],
    ),
    "statins": (["HMG-CoA Reductase Inhibitor"], ["statin", "HMG-CoA reductase inhibitor"]),
    "SSRI/SNRI antidepressants": (
        ["Serotonin Reuptake Inhibitor", "Serotonin and Norepinephrine Reuptake Inhibitor"],
        ["SSRI", "SNRI", "serotonin reuptake inhibitor", "serotonin and norepinephrine reuptake inhibitor",
         "serotonergic"],
    ),
    "opioids": (
        ["Opioid Agonist", "Opioid Agonist/Antagonist", "Partial Opioid Agonist"],
        ["opioid", "narcotic", "CNS depressant"],
    ),
    "benzodiazepines": (["Benzodiazepine"], ["benzodiazepine", "CNS depressant"]),
    "antihistamines": (["Histamine-1 Receptor Antagonist"], ["antihistamine"]),
    "thiazide diuretics": (["Thiazide Diuretic", "Thiazide-like Diuretic"], ["thiazide", "diuretic"]),
    "loop diuretics": (["Loop Diuretic"], ["loop diuretic", "diuretic"]),
    "potassium-sparing diuretics": (
        ["Aldosterone Antagonist", "Potassium-sparing Diuretic"],
        ["potassium-sparing diuretic", "aldosterone antagonist", "diuretic"],
    ),
    "sulfonylureas": (["Sulfonylurea"], ["sulfonylurea", "insulin secretagogue"]),
    "insulins": (["Insulin", "Insulin Analog"], ["insulin"]),
    "corticosteroids": (["Corticosteroid"], ["corticosteroid", "steroid"]),
    "proton pump inhibitors": (["Proton Pump Inhibitor"], ["proton pump inhibitor", "PPI"]),
    "beta blockers": (["beta-Adrenergic Blocker"], ["beta blocker", "beta-adrenergic blocker", "beta-adrenergic blocking"]),
    "calcium channel blockers": (
        ["Calcium Channel Blocker", "Dihydropyridine Calcium Channel Blocker"],
        ["calcium channel blocker"],
    ),
    "macrolide antibiotics": (["Macrolide Antimicrobial"], ["macrolide"]),
    "azole antifungals": (["Azole Antifungal"], ["azole antifungal"]),
    "fluoroquinolone antibiotics": (["Fluoroquinolone Antibacterial"], ["fluoroquinolone", "quinolone"]),
    "digoxin-type heart medicines": (["Cardiac Glycoside"], ["digitalis", "cardiac glycoside"]),
    "thyroid hormones": (["l-Thyroxine", "l-Triiodothyronine"], ["thyroid hormone"]),
    "MAO inhibitors": (["Monoamine Oxidase Inhibitor"], ["MAOI", "MAO inhibitor", "monoamine oxidase inhibitor"]),
    "tricyclic antidepressants": (["Tricyclic Antidepressant"], ["tricyclic antidepressant"]),
    "antipsychotics": (["Atypical Antipsychotic", "Typical Antipsychotic"], ["antipsychotic"]),
}

# Extra label wording for ingredients that have no FDA drug class
INGREDIENT_TERMS = {
    "potassium chloride": ["potassium supplement", "potassium-containing"],
    "potassium citrate": ["potassium supplement", "potassium-containing"],
}

_SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9•(\"])")


@dataclass
class Medication:
    rxcui: str
    name: str
    ingredients: list[str]                             # base ingredient names, e.g. ["ibuprofen"]
    classes: list[str] = field(default_factory=list)  # FDA drug classes from RxClass
    brand: str | None = None                           # e.g. "Advil"
    label: dict | None = None                          # raw openFDA label, or None if not found
    source_url: str | None = None                      # DailyMed page for that label

    @property
    def groups(self) -> list[str]:
        return [name for name, (classes, _) in DRUG_GROUPS.items() if set(classes) & set(self.classes)]

    def terms(self) -> list[str]:
        """Every word a label might use for this medication: ingredients, brand, and class words."""
        terms = list(self.ingredients)
        if self.brand:
            terms.append(self.brand)
        for ingredient in self.ingredients:
            terms.extend(INGREDIENT_TERMS.get(ingredient.casefold(), []))
        for group in self.groups:
            terms.extend(DRUG_GROUPS[group][1])
        return list(dict.fromkeys(terms))


def term_pattern(term: str) -> re.Pattern[str]:
    """Whole-word match that allows plurals and hyphens: "NSAID" matches "NSAIDs",
    "beta blocker" matches "beta-blockers", but "statin" does not match "atorvastatin"."""
    words = (re.escape(word) for word in re.split(r"[\s-]+", term.strip()))
    # Short abbreviations (ARB, PPI, NSAID) must be capitalized to avoid matching ordinary words
    flags = 0 if term.isupper() and len(term) <= 5 else re.IGNORECASE
    return re.compile(r"(?<!\w)" + r"[\s-]+".join(words) + r"(?:s|es)?(?!\w)", flags)


def _normalize(text: str) -> str:
    return " ".join(text.split()).casefold()


def _texts(label: dict, field_name: str) -> list[str]:
    values = label.get(field_name, [])
    if isinstance(values, str):
        values = [values]
    return [value for value in values if isinstance(value, str) and value.strip()]


def _pieces(text: str) -> list[str]:
    """Short sections stay whole; long ones are split into sentences (exact substrings)."""
    text = text.strip()
    if len(text) <= MAX_PASSAGE_CHARS:
        return [text]
    return [piece.strip() for piece in _SENTENCE_BREAK.split(text) if piece.strip()]


def _around(piece: str, match: re.Match[str]) -> str:
    """Cut a run-on sentence to a window around the match, on word boundaries."""
    if len(piece) <= MAX_PASSAGE_CHARS:
        return piece
    half = max(0, (MAX_PASSAGE_CHARS - (match.end() - match.start())) // 2)
    start = max(0, match.start() - half)
    end = min(len(piece), match.end() + half)
    if start > 0:
        space = piece.find(" ", start, match.start())
        start = space + 1 if space != -1 else start
    if end < len(piece):
        space = piece.rfind(" ", match.end(), end)
        end = space if space != -1 else end
    return piece[start:end].strip()


def label_mentions(label_med: Medication, other: Medication) -> list[dict]:
    """Passages in label_med's FDA label that mention the other medication, by name or class.

    Words that also describe label_med itself are skipped: an NSAID label says "NSAIDs" about
    itself all the time, so that word cannot show it is warning about a second NSAID.
    """
    if not label_med.label:
        return []
    own_terms = {term.casefold() for term in label_med.terms()}
    patterns = [(term, term_pattern(term)) for term in other.terms() if term.casefold() not in own_terms]
    if not patterns:
        return []

    found: list[dict] = []
    for field_name, (section, severity) in CHECKED_SECTIONS.items():
        for text in _texts(label_med.label, field_name):
            for piece in _pieces(text):
                matches = [match for _, pattern in patterns if (match := pattern.search(piece))]
                if not matches:
                    continue
                passage = _around(piece, min(matches, key=lambda match: match.start()))
                key = _normalize(passage)
                # OTC "Warnings" repeats the smaller sections, so skip passages already found
                if any(key in _normalize(f["passage"]) or _normalize(f["passage"]) in key for f in found):
                    continue
                found.append({
                    "label_drug": label_med.name,
                    "label_rxcui": label_med.rxcui,
                    "other_drug": other.name,
                    "other_rxcui": other.rxcui,
                    "matched_terms": [term for term, pattern in patterns if pattern.search(passage)],
                    "section": section,
                    "severity": severity,
                    "passage": passage,
                    "source_url": label_med.source_url,
                })
                if len(found) == MAX_FINDINGS_PER_LABEL:
                    return found
    return found


def _shared(a: Medication, b: Medication) -> list[dict]:
    """Same ingredient or same drug group: possible double dosing, even with no label passage."""
    ingredients_b = {value.casefold() for value in b.ingredients}
    shared = [{"kind": "ingredient", "value": value} for value in a.ingredients if value.casefold() in ingredients_b]
    shared += [{"kind": "drug_group", "value": group} for group in a.groups if group in b.groups]
    return shared


def find_interactions(medications: list[Medication]) -> list[dict]:
    """Check every pair of medications; most serious pairs first.

    A pair with nothing found is reported as "no_evidence_found", never as safe: the labels
    may simply not mention it, or a label may be missing.
    """
    pairs = []
    for a, b in combinations(medications, 2):
        findings = label_mentions(a, b) + label_mentions(b, a)
        findings.sort(key=lambda finding: SEVERITY_RANK[finding["severity"]])
        shared = _shared(a, b)
        pairs.append({
            "medications": [a.name, b.name],
            "rxcuis": [a.rxcui, b.rxcui],
            "status": "evidence_found" if findings or shared else "no_evidence_found",
            "highest_severity": findings[0]["severity"] if findings else None,
            "findings": findings,
            "shared": shared,
            "labels_missing": [med.name for med in (a, b) if not med.label],
        })

    def rank(pair: dict) -> int:
        if pair["highest_severity"]:
            return SEVERITY_RANK[pair["highest_severity"]]
        return 2 if pair["shared"] else 3

    pairs.sort(key=rank)
    number = 0
    for pair in pairs:
        for finding in pair["findings"]:
            number += 1
            finding["id"] = f"F{number}"
    return pairs

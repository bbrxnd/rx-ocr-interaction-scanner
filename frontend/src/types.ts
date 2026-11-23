// Shapes of the data the backend sends back.

/** A medication the user added to their list. */
export type Medication = {
  rxcui: string
  name: string
  tty: string
  ingredients: string[]
}

/** One RxNorm search result from /api/rxnorm/search. */
export type DrugConcept = {
  rxcui: string
  name: string
  tty: string
  synonym?: string
  ingredients: { rxcui: string; name: string; tty: string }[]
}

export type LabelSection = { section: string; text: string }

export type LabelInfo = {
  match_basis: string
  source_url: string
  metadata: {
    brand_name?: string[]
    generic_name?: string[]
    manufacturer_name?: string[]
    effective_time?: string | null
    set_id?: string | null
  }
  sections: LabelSection[]
}

export type Severity = 'high' | 'moderate'

/** An exact label passage where one medication's label mentions another one. */
export type Finding = {
  id: string
  label_drug: string
  label_rxcui: string
  other_drug: string
  other_rxcui: string
  matched_terms: string[]
  section: string
  severity: Severity
  passage: string
  source_url: string | null
}

export type SharedItem = { kind: 'ingredient' | 'drug_group'; value: string }

export type Pair = {
  medications: [string, string]
  rxcuis: [string, string]
  status: 'evidence_found' | 'no_evidence_found'
  highest_severity: Severity | null
  findings: Finding[]
  shared: SharedItem[]
  labels_missing: string[]
}

export type CheckedMedication = {
  rxcui: string
  name: string
  ingredients: string[]
  drug_groups: string[]
  label: LabelInfo | null
}

/** Response from POST /api/check. */
export type CheckResponse = {
  medications: CheckedMedication[]
  pairs: Pair[]
}

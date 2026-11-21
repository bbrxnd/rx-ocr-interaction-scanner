import { useState } from 'react'
import PairReview from './PairReview'
import type { SubmitEvent } from 'react'

type RxNormProperties = {
  rxcui: string
  name: string
  synonym?: string
  tty: string
}

type Ingredient = {
  rxcui: string
  name: string
  tty: string
}

type DrugConcept = RxNormProperties & {
  ingredients: Ingredient[]
}

type SearchResponse = { concepts?: DrugConcept[]; detail?: string }
type LabelSection = { section: string; text: string }
type FDAResult = {
  matched: boolean
  label: null | {
    match_basis: string
    source_url: string
    metadata: {
      brand_name?: string[]
      generic_name?: string[]
      manufacturer_name?: string[]
      effective_time?: string
      set_id?: string
    }
    sections: LabelSection[]
  }
  detail?: string
}

export default function App() {
  const [query, setQuery] = useState('')
  const [concepts, setConcepts] = useState<DrugConcept[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [selectedRxcui, setSelectedRxcui] = useState('')
  const [labelResult, setLabelResult] = useState<FDAResult | null>(null)
  const [labelLoading, setLabelLoading] = useState(false)
  const [labelError, setLabelError] = useState('')

  async function handleSearch(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const medicationName = query.trim()
    if (!medicationName || loading) return

    setLoading(true)
    setError('')
    setConcepts([])
    setSelectedRxcui('')
    setLabelResult(null)
    setLabelError('')
    setSearched(true)

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      const params = new URLSearchParams({ name: medicationName })
      const response = await fetch(`/api/rxnorm/search?${params}`, { signal: controller.signal })
      const body = await response.json() as SearchResponse
      if (!response.ok) throw new Error(body.detail ?? `Search failed with HTTP ${response.status}.`)
      const results = body.concepts ?? []
      setConcepts(results)
      if (results.length === 0) setError('No matching RxNorm concepts were found. Try a generic or brand name, or include the strength and dosage form.')
    } catch (searchError) {
      setError(searchError instanceof DOMException && searchError.name === 'AbortError'
        ? 'The lookup timed out. Please try again.'
        : searchError instanceof Error ? searchError.message : 'Could not reach the application API. Please try again.')
    } finally {
      window.clearTimeout(timeout)
      setLoading(false)
    }
  }

  async function handleSelectConcept(rxcui: string) {
    if (labelLoading) return
    setSelectedRxcui(rxcui)
    setLabelResult(null)
    setLabelError('')
    setLabelLoading(true)
    try {
      const params = new URLSearchParams({ rxcui })
      const response = await fetch(`/api/fda/label?${params}`)
      const body = await response.json() as FDAResult
      if (!response.ok) throw new Error(body.detail ?? `FDA lookup failed with HTTP ${response.status}.`)
      setLabelResult(body)
    } catch (lookupError) {
      setLabelError(lookupError instanceof Error ? lookupError.message : 'Could not retrieve FDA label evidence.')
    } finally {
      setLabelLoading(false)
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="eyebrow">Medication reference</p>
        <h1>Medication evidence explorer</h1>
        <p className="intro">Search a medication, select the matching RxNorm concept, and review evidence from its FDA label.</p>
      </header>

      <PairReview />

      <section className="search-panel" aria-labelledby="search-title">
        <h2 id="search-title">Look up a medication</h2>
        <form className="search-form" onSubmit={handleSearch}>
          <label htmlFor="medication-name">Medication name</label>
          <div className="search-controls">
            <input
              id="medication-name"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="For example, Lipitor or atorvastatin 20 mg"
              autoComplete="off"
              required
            />
            <button type="submit" disabled={loading || !query.trim()}>
              {loading ? 'Searching…' : 'Search RxNorm'}
            </button>
          </div>
          <p className="field-hint">You can enter a generic name, brand name, or a name with strength and dosage form.</p>
        </form>
      </section>

      <section className="results" aria-live="polite" aria-busy={loading}>
        {loading && <p className="status-message">Searching RxNorm and retrieving ingredient details…</p>}
        {!loading && error && <p className="status-message error-message" role="alert">{error}</p>}
        {!loading && searched && !error && concepts.length > 0 && (
          <>
            <div className="results-heading">
              <h2>Matching concepts</h2>
              <span>{concepts.length} {concepts.length === 1 ? 'result' : 'results'}</span>
            </div>
            <div className="concept-list">
              {concepts.map((concept) => (
                <article className="concept-card" key={concept.rxcui}>
                  <div className="concept-title-row">
                    <div>
                      <p className="concept-type">{concept.tty}</p>
                      <h3>{concept.name}</h3>
                    </div>
                    <span className="rxcui">RxCUI {concept.rxcui}</span>
                  </div>
                  {concept.synonym && concept.synonym !== concept.name && <p className="synonym">Also listed as: {concept.synonym}</p>}
                  <div className="ingredient-section">
                    <h4>Ingredient information</h4>
                    {concept.ingredients.length > 0 ? (
                      <ul>
                        {concept.ingredients.map((ingredient) => (
                          <li key={ingredient.rxcui}>
                            <span>{ingredient.name}</span>
                            <span className="ingredient-type">{ingredient.tty}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No related ingredient concept was returned for this result.</p>
                    )}
                  </div>
                  <button
                    className="select-concept-button"
                    type="button"
                    disabled={labelLoading}
                    aria-pressed={selectedRxcui === concept.rxcui}
                    onClick={() => void handleSelectConcept(concept.rxcui)}
                  >
                    {selectedRxcui === concept.rxcui && labelLoading ? 'Finding FDA label…' : 'View FDA label evidence'}
                  </button>
                </article>
              ))}
            </div>
            {selectedRxcui && (
              <section className="label-panel" aria-live="polite" aria-busy={labelLoading} aria-labelledby="label-evidence-title">
                <h2 id="label-evidence-title">FDA label evidence</h2>
                {labelLoading && <p className="status-message">Searching FDA labels using active ingredients, then the concept name…</p>}
                {!labelLoading && labelError && <p className="status-message error-message" role="alert">{labelError}</p>}
                {!labelLoading && labelResult && !labelResult.matched && (
                  <p className="status-message">No matching FDA label was found for this concept.</p>
                )}
                {!labelLoading && labelResult?.matched && labelResult.label && (
                  <>
                    <div className="label-meta">
                      <p>Matched by {labelResult.label.match_basis}.</p>
                      <p>
                        {[...(labelResult.label.metadata.brand_name ?? []), ...(labelResult.label.metadata.generic_name ?? [])].join(' · ')}
                        {labelResult.label.metadata.effective_time && ` · Label date ${labelResult.label.metadata.effective_time}`}
                      </p>
                      <a href={labelResult.label.source_url} target="_blank" rel="noreferrer">View source on openFDA</a>
                      <p className="label-disclaimer">FDA label records are submitted by manufacturers and may not reflect current labeling. This evidence is for reference and is not medical advice.</p>
                    </div>
                    {labelResult.label.sections.length ? (
                      <div className="evidence-list">
                        {labelResult.label.sections.map((section, index) => (
                          <article className="evidence-card" key={`${section.section}-${index}`}>
                            <h3>{section.section}</h3>
                            <blockquote>{section.text}</blockquote>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="status-message">A matching label was found, but it does not include the requested safety sections.</p>
                    )}
                  </>
                )}
              </section>
            )}
            <p className="source-note">This product uses publicly available data from the U.S. National Library of Medicine (NLM), National Institutes of Health, Department of Health and Human Services; NLM is not responsible for the product and does not endorse or recommend this or any other product.</p>
          </>
        )}
      </section>
    </main>
  )
}

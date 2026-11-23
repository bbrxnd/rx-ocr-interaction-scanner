import { useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import PhotoScan from './PhotoScan'
import { errorText, readJson } from './api'
import type { DrugConcept, Medication } from './types'

// RxNorm term types in plain words
const KINDS: Record<string, string> = {
  IN: 'Generic ingredient',
  PIN: 'Ingredient (salt form)',
  MIN: 'Combination',
  BN: 'Brand',
  SCD: 'Generic product',
  SBD: 'Brand product',
  SCDF: 'Generic dose form',
  SBDF: 'Brand dose form',
  SCDC: 'Generic strength',
  GPCK: 'Generic pack',
  BPCK: 'Brand pack',
}

type Props = {
  addedRxcuis: string[]
  full: boolean
  onAdd: (medication: Medication) => void
}

type Message = { text: string; isError: boolean }

function baseIngredients(concept: DrugConcept): string[] {
  return concept.ingredients.filter((item) => item.tty === 'IN').map((item) => item.name)
}

export default function MedicationSearch({ addedRxcuis, full, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [concepts, setConcepts] = useState<DrugConcept[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const latestSearch = useRef(0)

  async function search(text: string) {
    const name = text.trim()
    if (!name) return
    const searchId = ++latestSearch.current // ignore answers to older searches
    setLoading(true)
    setMessage(null)
    setConcepts([])
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(`/api/rxnorm/search?${new URLSearchParams({ name })}`, { signal: controller.signal })
      const body = await readJson<{ concepts: DrugConcept[] }>(response)
      if (!response.ok) throw new Error(errorText(body, response, 'Search'))
      if (searchId !== latestSearch.current) return
      const results = body.concepts ?? []
      setConcepts(results)
      if (!results.length) {
        setMessage({ text: `No matches for "${name}". Check the spelling, or try the brand or generic name.`, isError: false })
      }
    } catch (searchError) {
      if (searchId !== latestSearch.current) return
      const timedOut = searchError instanceof DOMException && searchError.name === 'AbortError'
      setMessage({
        text: timedOut
          ? 'The search took too long. Please try again.'
          : searchError instanceof Error ? searchError.message : 'Could not reach the app server.',
        isError: true,
      })
    } finally {
      window.clearTimeout(timeout)
      if (searchId === latestSearch.current) setLoading(false)
    }
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    void search(query)
  }

  function searchLine(line: string) {
    setQuery(line)
    void search(line)
  }

  function add(concept: DrugConcept) {
    onAdd({ rxcui: concept.rxcui, name: concept.name, tty: concept.tty, ingredients: baseIngredients(concept) })
    setConcepts([])
    setQuery('')
    setMessage(null)
  }

  return (
    <div className="medication-search">
      <form className="search-row" role="search" onSubmit={handleSubmit}>
        <label htmlFor="medication-name" className="visually-hidden">Medication name</label>
        <input
          id="medication-name"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a medicine, e.g. Advil or lisinopril 10 mg"
          autoComplete="off"
          disabled={full}
        />
        <button type="submit" className="button primary" disabled={loading || full || !query.trim()}>
          {loading ? 'Searching…' : 'Search'}
        </button>
        <button
          type="button"
          className="button secondary"
          aria-expanded={scanOpen}
          onClick={() => setScanOpen((open) => !open)}
        >
          {scanOpen ? 'Hide photo scan' : 'Scan a label'}
        </button>
      </form>
      {full && <p className="fine-print">You've reached the limit of 10 medications.</p>}

      {scanOpen && <PhotoScan onUseLine={searchLine} />}

      <div aria-live="polite" aria-busy={loading}>
        {loading && <p className="status">Searching RxNorm…</p>}
        {message && (
          <p className={message.isError ? 'status error' : 'status'} role={message.isError ? 'alert' : undefined}>
            {message.text}
          </p>
        )}
        {concepts.length > 0 && (
          <>
            <p className="list-label">Choose the one that matches the bottle:</p>
            <ul className="match-list">
              {concepts.map((concept) => {
                const added = addedRxcuis.includes(concept.rxcui)
                const ingredients = baseIngredients(concept).filter(
                  (name) => name.toLowerCase() !== concept.name.toLowerCase(),
                )
                return (
                  <li key={concept.rxcui}>
                    <div>
                      <span className="match-name">{concept.name}</span>
                      <span className="match-meta">
                        {KINDS[concept.tty] ?? concept.tty}
                        {ingredients.length > 0 && ` · ${ingredients.join(', ')}`}
                      </span>
                    </div>
                    <button type="button" className="button small" disabled={added || full} onClick={() => add(concept)}>
                      {added ? 'Added' : 'Add'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

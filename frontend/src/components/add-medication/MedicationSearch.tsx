import { useRef, useState } from 'react'
import type { CSSProperties, ReactNode, SubmitEvent } from 'react'
import PhotoScan from './PhotoScan'
import { errorText, readJson } from '../../lib/api'
import { describeConcept } from '../../lib/format'
import { CameraIcon, SearchIcon, UploadIcon } from '../icons'
import type { DrugConcept, Medication } from '../../types'

type Mode = 'search' | 'camera' | 'upload'

const MODES: { id: Mode; label: string; icon: ReactNode }[] = [
  { id: 'search', label: 'Search', icon: <SearchIcon /> },
  { id: 'camera', label: 'Camera', icon: <CameraIcon /> },
  { id: 'upload', label: 'Upload', icon: <UploadIcon /> },
]

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
  const [mode, setMode] = useState<Mode>('search')
  const [direction, setDirection] = useState(0) // which way the panel slides in: 1 from the right, -1 from the left
  const [query, setQuery] = useState('')
  const [concepts, setConcepts] = useState<DrugConcept[]>([])
  const [searchedFor, setSearchedFor] = useState('')
  const [fromPhoto, setFromPhoto] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [scanCount, setScanCount] = useState(0) // a new number resets the photo panel
  const latestSearch = useRef(0) // ignore answers to older searches

  const modeIndex = MODES.findIndex((item) => item.id === mode)

  function switchMode(next: Mode) {
    latestSearch.current++
    setDirection(MODES.findIndex((item) => item.id === next) > modeIndex ? 1 : -1)
    setMode(next)
    setConcepts([])
    setMessage(null)
    setLoading(false)
  }

  async function search(text: string, photo: boolean) {
    const name = text.trim()
    if (!name) return
    const searchId = ++latestSearch.current
    setLoading(true)
    setMessage(null)
    setConcepts([])
    setSearchedFor(name)
    setFromPhoto(photo)
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
    void search(query, false)
  }

  function add(concept: DrugConcept) {
    onAdd({
      rxcui: concept.rxcui,
      name: concept.name,
      tty: concept.tty,
      ingredients: baseIngredients(concept),
      source: fromPhoto ? 'photo' : 'search',
    })
    setConcepts([])
    setQuery('')
    setMessage(null)
    if (fromPhoto) setScanCount((count) => count + 1) // ready for the next bottle
  }

  return (
    <div className="add-medication">
      <div className="mode-switch" role="group" aria-label="How to add a medication">
        {/* The white pill behind the chosen button; it slides between them */}
        <span className="mode-indicator" aria-hidden="true" style={{ '--index': modeIndex } as CSSProperties} />
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            className="mode-button"
            aria-pressed={mode === item.id}
            onClick={() => switchMode(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {full && <p className="status">You've reached the limit of 10 medications. Remove one to add another.</p>}

      {/* A new key re-mounts the panel, which plays its slide-in animation */}
      {!full && (
        <div className="mode-panel" key={mode} data-direction={direction}>
          {mode === 'search' ? (
            <form role="search" onSubmit={handleSubmit}>
              <label htmlFor="medication-name" className="field-label">Medicine name</label>
              <div className="search-row">
                <input
                  id="medication-name"
                  className="text-input"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoComplete="off"
                />
                <button type="submit" className="button primary" disabled={loading || !query.trim()}>
                  {loading && <span className="spinner" aria-hidden="true" />}
                  {loading ? 'Searching…' : 'Search'}
                </button>
              </div>
              <p className="hint">Brand or generic name. Strength helps, like "lisinopril 10 mg".</p>
            </form>
          ) : (
            <PhotoScan
              key={`${mode}-${scanCount}`}
              source={mode}
              onSearchLine={(line) => void search(line, true)}
              onStopCamera={() => switchMode('search')}
            />
          )}
        </div>
      )}

      <div aria-live="polite" aria-busy={loading}>
        {loading && (
          <>
            <p className="visually-hidden">Searching RxNorm…</p>
            <div className="skeleton-list" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </>
        )}
        {message && (
          <p className={message.isError ? 'status error' : 'status'} role={message.isError ? 'alert' : undefined}>
            {message.text}
          </p>
        )}
        {concepts.length > 0 && (
          <>
            <h3 className="list-title">Matches for "{searchedFor}"</h3>
            <ul className="option-list">
              {concepts.map((concept) => {
                const added = addedRxcuis.includes(concept.rxcui)
                return (
                  <li key={concept.rxcui}>
                    <div>
                      <div className="item-name">{concept.name}</div>
                      <div className="item-meta">{describeConcept(concept.name, concept.tty, baseIngredients(concept))}</div>
                    </div>
                    <button
                      type="button"
                      className="button outline"
                      disabled={added || full}
                      aria-label={added ? `${concept.name} is already on the list` : `Add ${concept.name}`}
                      onClick={() => add(concept)}
                    >
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
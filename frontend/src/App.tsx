import { useRef, useState } from 'react'
import CheckResults from './components/results/CheckResults'
import MedicationSearch from './components/add-medication/MedicationSearch'
import ThemeToggle from './components/ThemeToggle'
import { LogoMark } from './components/icons'
import { errorText, readJson } from './lib/api'
import { describeMedication } from './lib/format'
import { prefersReducedMotion } from './lib/motion'
import type { CheckResponse, Medication } from './types'

const MAX_MEDICATIONS = 10
const ABOUT_URL = 'https://github.com/bbrxnd/rx-ocr-interaction-scanner#how-it-works'

export default function App() {
  const [medications, setMedications] = useState<Medication[]>([])
  const [result, setResult] = useState<CheckResponse | null>(null)
  const [checkedAt, setCheckedAt] = useState(() => new Date())
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const listVersion = useRef(0) // results from before a list change are thrown away
  const resultsRef = useRef<HTMLElement>(null)

  function changeList(next: Medication[]) {
    listVersion.current++
    setMedications(next)
    setResult(null)
    setError('')
    setChecking(false)
  }

  async function runCheck() {
    if (medications.length < 2 || checking) return
    const version = listVersion.current
    setChecking(true)
    setError('')
    setResult(null)
    
    const results = resultsRef.current
    if (results && results.getBoundingClientRect().top > window.innerHeight * 0.75) {
      results.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    }
    try {
      const response = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rxcuis: medications.map((medication) => medication.rxcui) }),
      })
      const body = await readJson<CheckResponse>(response)
      if (!response.ok || !body.pairs || !body.medications) throw new Error(errorText(body, response, 'The check'))
      if (version === listVersion.current) {
        setResult({ pairs: body.pairs, medications: body.medications })
        setCheckedAt(new Date())
      }
    } catch (checkError) {
      if (version === listVersion.current) {
        setError(checkError instanceof Error ? checkError.message : 'Could not reach the app server.')
      }
    } finally {
      if (version === listVersion.current) setChecking(false)
    }
  }

  return (
    <div className="app">
      <header className="site-header">
        <div className="container header-inner">
          <div className="brand">
            <span className="brand-mark"><LogoMark size={18} /></span>
            <span className="brand-name">Medication Interaction Explainer</span>
          </div>
          <div className="header-actions no-print">
            <a className="header-link" href={ABOUT_URL} target="_blank" rel="noreferrer">How it works</a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container page-main">
        <div className="hero">
          <h1>Check a medication list</h1>
          <p className="lede">
            Add every medicine someone takes. We compare each pair against the warnings in their FDA labels and show
            you the exact text.
          </p>
          <p className="hero-note">Not medical advice. Consult a pharmacist for further clarification</p>
        </div>

        <div className="layout">
          <section className="panel meds-panel" aria-labelledby="meds-heading">
            <div className="panel-head">
              <h2 id="meds-heading">Medications</h2>
              <span className="count">{medications.length} of {MAX_MEDICATIONS}</span>
            </div>

            <div className="panel-body no-print">
              <MedicationSearch
                addedRxcuis={medications.map((medication) => medication.rxcui)}
                full={medications.length >= MAX_MEDICATIONS}
                onAdd={(medication) => changeList([...medications, medication])}
              />
            </div>

            {medications.length > 0 ? (
              <ol className="med-list" aria-label="Medication list">
                {medications.map((medication) => (
                  <li key={medication.rxcui}>
                    <div>
                      <div className="item-name">{medication.name}</div>
                      <div className="item-meta">{describeMedication(medication)}</div>
                    </div>
                    <button
                      type="button"
                      className="link-button no-print"
                      aria-label={`Remove ${medication.name}`}
                      onClick={() => changeList(medications.filter((item) => item.rxcui !== medication.rxcui))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="med-empty">No medications yet.</p>
            )}

            <div className="panel-foot no-print">
              <button
                type="button"
                className="button primary wide"
                disabled={medications.length < 2 || checking}
                onClick={() => void runCheck()}
              >
                {checking && <span className="spinner" aria-hidden="true" />}
                {checking ? 'Checking labels…' : 'Check interactions'}
              </button>
              <p className="hint">
                {medications.length < 2 ? 'Add at least two medications. ' : ''}
                Don't enter names or other personal details. Nothing you enter is saved.
              </p>
            </div>
          </section>

          <section
            ref={resultsRef}
            className="results-column"
            aria-label="Results"
            aria-live="polite"
            aria-busy={checking}
          >
            {!result && !checking && !error && (
              <div className="results-empty">
                <h2>What the labels say</h2>
                <p>
                  Add at least two medications, then select Check interactions. For each pair, you'll see the exact
                  sentences from the FDA labels that mention the other medicine.
                </p>
                <ul className="legend" aria-label="What the colors mean">
                  <li>
                    <span className="dot serious" />
                    <strong>Serious</strong>
                    <span>A boxed warning, or the label says not to take them together</span>
                  </li>
                  <li>
                    <span className="dot warning" />
                    <strong>Warning</strong>
                    <span>Another label warning that mentions the other medicine</span>
                  </li>
                  <li>
                    <span className="dot shared" />
                    <strong>Same ingredient or type</strong>
                    <span>Taking both could mean a double dose</span>
                  </li>
                </ul>
              </div>
            )}
            {checking && (
              <>
                <p className="status">Looking up {medications.length} FDA labels and comparing every pair…</p>
                {/* Placeholder cards while the check runs */}
                {[1, 2].map((placeholder) => (
                  <div className="skeleton-card" key={placeholder} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                ))}
              </>
            )}
            {error && <p className="status error" role="alert">{error}</p>}
            {result && <CheckResults result={result} checkedAt={checkedAt} />}
          </section>
        </div>
      </main>

      <footer className="site-footer">
        <div className="container">
          Medication names and drug classes from RxNorm and RxClass, U.S. National Library of Medicine. Label text from
          openFDA and DailyMed. This product uses publicly available data from the NLM; NLM is not responsible for the
          product and does not endorse or recommend this or any other product.
        </div>
      </footer>
    </div>
  )
}
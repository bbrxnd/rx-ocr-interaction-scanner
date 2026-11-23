import { useRef, useState } from 'react'
import CheckResults from './CheckResults'
import MedicationSearch from './MedicationSearch'
import { errorText, readJson } from './api'
import type { CheckResponse, Medication } from './types'

const MAX_MEDICATIONS = 10

export default function App() {
  const [medications, setMedications] = useState<Medication[]>([])
  const [result, setResult] = useState<CheckResponse | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const listVersion = useRef(0) // results from before a list change are thrown away

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
    try {
      const response = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rxcuis: medications.map((medication) => medication.rxcui) }),
      })
      const body = await readJson<CheckResponse>(response)
      if (!response.ok || !body.pairs || !body.medications) throw new Error(errorText(body, response, 'The check'))
      if (version === listVersion.current) setResult({ pairs: body.pairs, medications: body.medications })
    } catch (checkError) {
      if (version === listVersion.current) {
        setError(checkError instanceof Error ? checkError.message : 'Could not reach the app server.')
      }
    } finally {
      if (version === listVersion.current) setChecking(false)
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>Medication Interaction Explainer</h1>
        <p className="intro">
          Add the medicines someone takes. We check every pair against the warnings in their official FDA labels,
          show you the exact label text, and can explain it in plain language.
        </p>
      </header>

      <section className="card" aria-labelledby="list-title">
        <h2 id="list-title"><span className="step">1</span>Your medications</h2>
        <MedicationSearch
          addedRxcuis={medications.map((medication) => medication.rxcui)}
          full={medications.length >= MAX_MEDICATIONS}
          onAdd={(medication) => changeList([...medications, medication])}
        />

        {medications.length > 0 ? (
          <ul className="med-list" aria-label="Medication list">
            {medications.map((medication) => {
              const ingredients = medication.ingredients.filter(
                (name) => !medication.name.toLowerCase().includes(name.toLowerCase()),
              )
              return (
                <li key={medication.rxcui}>
                  <span>
                    {medication.name}
                    {ingredients.length > 0 && <span className="med-ingredients"> ({ingredients.join(', ')})</span>}
                  </span>
                  <button
                    type="button"
                    className="link-button"
                    aria-label={`Remove ${medication.name}`}
                    onClick={() => changeList(medications.filter((item) => item.rxcui !== medication.rxcui))}
                  >
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="empty">No medications yet. Search for one or scan a label to add it.</p>
        )}

        <div className="check-row">
          <button
            type="button"
            className="button primary large"
            disabled={medications.length < 2 || checking}
            onClick={() => void runCheck()}
          >
            {checking ? 'Checking labels…' : 'Check for interactions'}
          </button>
          {medications.length < 2 && <span className="fine-print">Add at least two medications.</span>}
        </div>
        <p className="fine-print">
          Don't enter names or other personal details. This tool is for learning and is not medical advice.
        </p>
      </section>

      <div aria-live="polite" aria-busy={checking}>
        {checking && <p className="status">Looking up {medications.length} FDA labels and comparing every pair…</p>}
        {error && <p className="status error" role="alert">{error}</p>}
        {result && <CheckResults result={result} />}
      </div>

      <footer className="page-footer">
        <p>
          Medication names come from RxNorm; label text comes from openFDA and DailyMed. This product uses publicly
          available data from the U.S. National Library of Medicine (NLM), National Institutes of Health, Department
          of Health and Human Services; NLM is not responsible for the product and does not endorse or recommend this
          or any other product.
        </p>
      </footer>
    </main>
  )
}

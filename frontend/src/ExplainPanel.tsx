import { useState } from 'react'
import { errorText, readJson } from './api'

export type EvidenceInput = { drug: string; section: string; text: string }

type ExplainedPoint = {
  text: string
  quote: string
  evidence_id: string
  drug: string
  section: string
}

type ExplainResult = {
  status: 'explained' | 'abstained'
  points: ExplainedPoint[]
  dropped: number
  model: string
}

type Props = {
  medications: string[]
  evidence: EvidenceInput[]
}

export default function ExplainPanel({ medications, evidence }: Props) {
  const [result, setResult] = useState<ExplainResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleExplain() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medications, evidence }),
      })
      const body = await readJson<ExplainResult>(response)
      if (!response.ok || !body.status) throw new Error(errorText(body, response, 'The explanation'))
      setResult(body as ExplainResult)
    } catch (explainError) {
      setError(explainError instanceof Error ? explainError.message : 'Could not get an explanation.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="explain-panel" aria-live="polite" aria-busy={loading}>
      {!result && (
        <button className="button secondary" type="button" disabled={loading} onClick={() => void handleExplain()}>
          {loading ? 'Explaining…' : 'Explain in plain language'}
        </button>
      )}

      {error && <p className="status error" role="alert">{error}</p>}

      {result?.status === 'abstained' && (
        <p className="status">
          We couldn't write an explanation that is backed by exact words from the label. Please read the label
          text and ask a pharmacist.
        </p>
      )}

      {result?.status === 'explained' && (
        <div className="explain-result">
          <h4>In plain language</h4>
          <ul className="explain-list">
            {result.points.map((point, index) => (
              <li key={`${point.evidence_id}-${index}`}>
                <p>{point.text}</p>
                <blockquote>
                  “{point.quote}”
                  <cite>{point.drug} label · {point.section}</cite>
                </blockquote>
              </li>
            ))}
          </ul>
          <p className="fine-print">
            Written by AI ({result.model}) using only the FDA label text shown here. Each point quotes the label
            it comes from. This is not medical advice; ask a doctor or pharmacist.
            {result.dropped > 0 && ` ${result.dropped} point(s) were removed because their quote wasn't found in the label.`}
          </p>
        </div>
      )}
    </div>
  )
}

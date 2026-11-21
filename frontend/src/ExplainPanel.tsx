import { useState } from 'react'

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
    setResult(null)
    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medications, evidence }),
      })
      const body = await response.json()
      if (!response.ok) {
        throw new Error(typeof body.detail === 'string' ? body.detail : `Explanation failed with HTTP ${response.status}.`)
      }
      setResult(body as ExplainResult)
    } catch (explainError) {
      setError(explainError instanceof Error ? explainError.message : 'Could not get an explanation.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="explain-panel" aria-live="polite" aria-busy={loading}>
      <h3>Plain-language explanation</h3>
      <button className="select-concept-button" type="button" disabled={loading} onClick={() => void handleExplain()}>
        {loading ? 'Explaining…' : 'Explain in plain language'}
      </button>

      {error && <p className="status-message error-message" role="alert">{error}</p>}

      {result?.status === 'abstained' && (
        <p className="status-message">
          We couldn't write an explanation that is backed by exact words from the label. Please read the
          label passages below and ask a pharmacist.
        </p>
      )}

      {result?.status === 'explained' && (
        <>
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
          <p className="label-disclaimer">
            Written by AI ({result.model}) using only this FDA label's text. Each point quotes the label
            section it comes from. This is not medical advice; ask a doctor or pharmacist.
            {result.dropped > 0 && ` ${result.dropped} point(s) were removed because their quote wasn't found in the label.`}
          </p>
        </>
      )}
    </section>
  )
}

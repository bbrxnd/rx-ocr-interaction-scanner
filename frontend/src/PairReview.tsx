import { useRef, useState } from 'react'
import PhotoScan from './PhotoScan'

type RecordItem = { id: string; names: string[]; finding: string; table_entry: string; source: { quote: string; url: string; title: string; section: string; version: string; updated: string; retrieved: string } }
type Result = { records: RecordItem[]; uncovered: string[]; explanation: null | { findings: { evidence_id: string; explanation: string }[]; label: string; generated: boolean }; explanation_error: string | null; detail?: string }

export default function PairReview() {
  const [text, setText] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const generation = useRef(0)
  const names = [...new Set(text.split(/\r?\n/).map(name => name.trim().toLowerCase()).filter(Boolean))]
  const supported = ['warfarin', 'aspirin', 'ibuprofen', 'acetaminophen', 'lisinopril']
  const unknown = names.filter(name => !supported.includes(name))
  const valid = names.length >= 2 && names.length <= 6 && unknown.length === 0

  function update(value: string) {
    generation.current++
    setText(value)
    setConfirmed(false)
    setResult(null)
    setError('')
    setLoading(false)
  }

  async function review() {
    const current = ++generation.current
    setLoading(true)
    setResult(null)
    setError('')
    try {
      const response = await fetch('/api/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names, confirmed }) })
      const body = await response.json() as Result
      if (!response.ok) throw new Error(body.detail ?? 'Could not retrieve evidence.')
      if (current === generation.current) setResult(body)
    } catch (err) {
      if (current === generation.current) setError(err instanceof Error ? err.message : 'Could not reach the application API.')
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }

  return <section className="pair-review" aria-labelledby="pair-title">
    <h2 id="pair-title">Build and review your medication list</h2>
    <p>Enter 2–6 generic ingredient names, one per line. This prototype recognizes warfarin, aspirin, ibuprofen, acetaminophen, and lisinopril.</p>
    <p className="notice">Educational prototype with limited coverage. Do not change medications based on this tool; discuss concerns with a pharmacist or prescriber. Strength, formulation, food, allergies, and patient-specific factors are not assessed.</p>
    <PhotoScan supported={supported} onAdd={added => update([...names, ...added.filter(name => !names.includes(name))].join('\n'))} />
    <h3>Or enter medications manually</h3>
    <div className="example-buttons">
      <button type="button" onClick={() => update('warfarin\naspirin')}>Load supported example</button>
      <button type="button" onClick={() => update('aspirin\nlisinopril')}>Load coverage example</button>
    </div>
    <label htmlFor="medication-list">Ingredient names</label>
    <textarea id="medication-list" rows={4} value={text} onChange={event => update(event.target.value)} placeholder={'warfarin\naspirin'} />
    {unknown.length > 0 && <p className="error-message status-message" role="alert">Unrecognized ingredients: {unknown.join(', ')}. Use exact generic names; doses and spelling variations are not guessed.</p>}
    {names.length > 6 && <p className="error-message status-message" role="alert">Enter no more than six different ingredients.</p>}
    {valid && <div className="confirmation">
      <p><strong>Review ingredients:</strong> {names.join(', ')}</p>
      <label><input type="checkbox" checked={confirmed} onChange={event => { generation.current++; setConfirmed(event.target.checked); setResult(null); setError(''); setLoading(false) }} /> These ingredient names match my intended list.</label>
    </div>}
    <button className="primary-button" type="button" disabled={!valid || !confirmed || loading} onClick={() => void review()}>{loading ? 'Preparing evidence…' : 'Find evidence and explain'}</button>
    <div aria-live="polite">
      {error && <p className="status-message error-message" role="alert">{error}</p>}
      {result && <div className="pair-results">
        <h3>Evidence and explanation</h3>
        {result.uncovered.length > 0 && <div className="notice"><strong>Outside prototype coverage.</strong> Missing evidence does not establish safety.<ul>{result.uncovered.map(pair => <li key={pair}>{pair}</li>)}</ul></div>}
        {result.explanation_error && <p className="status-message error-message">{result.explanation_error} Source evidence remains available below.</p>}
        {result.explanation && <div className="explanation"><strong>{result.explanation.generated ? 'AI-generated explanation; medical accuracy requires review.' : 'Demo mode: prepared summaries; no AI model was called.'}</strong><p>{result.explanation.label}</p>{result.explanation.findings.map(f => <p key={f.evidence_id}>[{f.evidence_id}] {f.explanation}</p>)}</div>}
        {result.records.map(record => <article className="evidence-card" key={record.id}>
          <h4>[{record.id}] {record.names.join(' + ')}</h4>
          <p>{record.finding}</p><blockquote>{record.source.quote}</blockquote>
          <p>Listed table entry: {record.table_entry}</p>
          <a href={record.source.url} target="_blank" rel="noreferrer">Read the DailyMed label</a>
          <p className="muted">{record.source.title} · Section {record.source.section} · Version {record.source.version} · Updated {record.source.updated} · Retrieved {record.source.retrieved}</p>
        </article>)}
      </div>}
    </div>
  </section>
}

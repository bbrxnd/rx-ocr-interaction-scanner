import ExplainPanel from './ExplainPanel'
import type { CheckedMedication, CheckResponse, Finding, Pair } from './types'

const FINDINGS_SHOWN = 2 // the rest go behind "Show more"

function pairTitle(pair: Pair): string {
  return pair.medications.join(' + ')
}

function badgeFor(pair: Pair): { text: string; tone: string } {
  if (pair.highest_severity === 'high') return { text: 'Serious warning', tone: 'high' }
  if (pair.highest_severity === 'moderate') return { text: 'Label warning', tone: 'moderate' }
  const sameIngredient = pair.shared.some((item) => item.kind === 'ingredient')
  return { text: sameIngredient ? 'Same ingredient' : 'Same type of medicine', tone: 'shared' }
}

function formatLabelDate(value?: string | null): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null
  const date = new Date(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8)))
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Highlights the words that linked this passage to the other medication (same rules as the backend). */
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>
  const alternatives = terms.map((term) => term.trim().split(/[\s-]+/).map(escapeRegExp).join('[\\s-]+') + '(?:s|es)?')
  const pieces = text.split(new RegExp(`(?<!\\w)(${alternatives.join('|')})(?!\\w)`, 'i'))
  // split() with one capture group puts the matched words at the odd positions
  return <>{pieces.map((piece, index) => (index % 2 ? <mark key={index}>{piece}</mark> : <span key={index}>{piece}</span>))}</>
}

function FindingItem({ finding }: { finding: Finding }) {
  return (
    <li className="finding">
      <blockquote>
        <Highlighted text={finding.passage} terms={finding.matched_terms} />
      </blockquote>
      <p className="finding-source">
        From the <strong>{finding.label_drug}</strong> label · {finding.section}
        {finding.source_url && (
          <>
            {' · '}
            <a href={finding.source_url} target="_blank" rel="noreferrer">open label</a>
          </>
        )}
      </p>
    </li>
  )
}

function PairCard({ pair }: { pair: Pair }) {
  const badge = badgeFor(pair)
  const shown = pair.findings.slice(0, FINDINGS_SHOWN)
  const more = pair.findings.slice(FINDINGS_SHOWN)
  return (
    <article className={`pair-card tone-${badge.tone}`}>
      <header className="pair-header">
        <h3>{pairTitle(pair)}</h3>
        <span className={`badge tone-${badge.tone}`}>{badge.text}</span>
      </header>

      {pair.shared.map((item) => (
        <p className="shared-note" key={`${item.kind}-${item.value}`}>
          {item.kind === 'ingredient' ? (
            <>Both contain <strong>{item.value}</strong>. Ask a pharmacist before taking both, so the total dose isn't too high.</>
          ) : (
            <>Both are <strong>{item.value}</strong>. Ask a pharmacist whether both are needed.</>
          )}
        </p>
      ))}

      {shown.length > 0 && (
        <ol className="finding-list">
          {shown.map((finding) => <FindingItem key={finding.id} finding={finding} />)}
        </ol>
      )}
      {more.length > 0 && (
        <details className="more">
          <summary>Show {more.length} more label passage{more.length === 1 ? '' : 's'}</summary>
          <ol className="finding-list">
            {more.map((finding) => <FindingItem key={finding.id} finding={finding} />)}
          </ol>
        </details>
      )}

      {pair.findings.length > 0 && (
        <ExplainPanel
          medications={pair.medications}
          evidence={pair.findings.map((finding) => ({
            drug: finding.label_drug,
            section: finding.section,
            text: finding.passage,
          }))}
        />
      )}
    </article>
  )
}

function FullLabel({ medication }: { medication: CheckedMedication }) {
  const label = medication.label
  const date = formatLabelDate(label?.metadata.effective_time)
  const names = [...(label?.metadata.brand_name ?? []), ...(label?.metadata.generic_name ?? [])]
  const uniqueNames = names.filter(
    (name, index) => names.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index,
  )
  return (
    <details className="label-details">
      <summary>
        {medication.name}
        {!label && <span className="muted"> (no FDA label found)</span>}
      </summary>
      {label && (
        <div className="label-body">
          <p className="fine-print">
            {uniqueNames.join(' · ')}
            {date && ` · label date ${date}`}
            {' · '}
            <a href={label.source_url} target="_blank" rel="noreferrer">View on DailyMed</a>
          </p>
          {label.sections.length > 0 && (
            <ExplainPanel
              medications={[medication.name]}
              evidence={label.sections.map((section) => ({
                drug: medication.name,
                section: section.section,
                text: section.text,
              }))}
            />
          )}
          {label.sections.map((section, index) => (
            <section className="label-section" key={`${section.section}-${index}`}>
              <h4>{section.section}</h4>
              <p>{section.text}</p>
            </section>
          ))}
        </div>
      )}
    </details>
  )
}

export default function CheckResults({ result }: { result: CheckResponse }) {
  const flagged = result.pairs.filter((pair) => pair.status === 'evidence_found')
  const clear = result.pairs.filter((pair) => pair.status === 'no_evidence_found')
  const missing = result.medications.filter((medication) => !medication.label)

  return (
    <section className="card" aria-labelledby="results-title">
      <h2 id="results-title"><span className="step">2</span>What the labels say</h2>
      <p className="summary">
        {flagged.length > 0
          ? `Found something to review for ${flagged.length} of ${result.pairs.length} medication pairs.`
          : `No label warnings found for ${result.pairs.length === 1 ? 'this pair' : `these ${result.pairs.length} pairs`}.`}
      </p>
      {missing.length > 0 && (
        <p className="notice">
          We couldn't find an FDA label for {missing.map((medication) => medication.name).join(', ')}. Pairs that
          include it were only checked against the other medicine's label.
        </p>
      )}

      <div className="pair-list">
        {flagged.map((pair) => <PairCard key={pair.rxcuis.join('+')} pair={pair} />)}
      </div>

      {clear.length > 0 && (
        <div className="no-evidence">
          <h3>No label warnings found</h3>
          <ul>
            {clear.map((pair) => <li key={pair.rxcuis.join('+')}>{pairTitle(pair)}</li>)}
          </ul>
          <p className="fine-print">
            This does not mean they are safe together. Labels don't list every interaction, so ask a pharmacist.
          </p>
        </div>
      )}

      <div className="full-labels">
        <h3>Full FDA labels</h3>
        {result.medications.map((medication) => <FullLabel key={medication.rxcui} medication={medication} />)}
      </div>
    </section>
  )
}

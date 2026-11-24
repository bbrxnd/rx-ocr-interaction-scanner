import type { ReactNode } from 'react'
import ExplainPanel from './ExplainPanel'
import { capitalize, formatLabelDate, shortName } from '../../lib/format'
import { PrinterIcon } from '../icons'
import type { CheckedMedication, CheckResponse, Finding, Pair } from '../../types'

const FINDINGS_SHOWN = 2 // the rest go behind "Show more"

type Names = Map<string, string> // rxcui -> short name

function toneOf(pair: Pair): 'serious' | 'warning' | 'shared' {
  if (pair.highest_severity === 'high') return 'serious'
  if (pair.highest_severity === 'moderate') return 'warning'
  return 'shared'
}

function tagText(pair: Pair): string {
  const section = pair.findings[0]?.section.toLowerCase()
  if (pair.highest_severity === 'high') return `Serious: ${section}`
  if (pair.highest_severity === 'moderate') return `Warning: ${section}`
  return pair.shared.some((item) => item.kind === 'ingredient') ? 'Same ingredient' : 'Same type of medicine'
}

/** "a", "a and b", "a, b and c" */
function joined(items: ReactNode[]): ReactNode[] {
  return items.flatMap((item, index) => (index === 0 ? [item] : [index === items.length - 1 ? ' and ' : ', ', item]))
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

function Quote({ finding, names }: { finding: Finding; names: Names }) {
  const labelName = names.get(finding.label_rxcui) ?? finding.label_drug
  return (
    <figure className="quote">
      <blockquote>"<Highlighted text={finding.passage} terms={finding.matched_terms} />"</blockquote>
      <figcaption>
        {capitalize(labelName)} label, {finding.section}.
        {finding.source_url && (
          <>
            {' '}
            <a href={finding.source_url} target="_blank" rel="noreferrer">Open on DailyMed</a>
          </>
        )}
      </figcaption>
    </figure>
  )
}

function PairCard({ pair, names }: { pair: Pair; names: Names }) {
  const tone = toneOf(pair)
  const [first, second] = pair.rxcuis.map((rxcui, index) => names.get(rxcui) ?? pair.medications[index])
  const shown = pair.findings.slice(0, FINDINGS_SHOWN)
  const more = pair.findings.slice(FINDINGS_SHOWN)
  const titleId = `pair-${pair.rxcuis.join('-')}`

  return (
    <article className={`pair ${tone}`} aria-labelledby={titleId}>
      <div className="pair-head">
        <span className="pair-tag">
          <span className={`dot ${tone}`} />
          {tagText(pair)}
        </span>
        <h3 id={titleId}>{first} + {second}</h3>
      </div>
      <div className="pair-body">
        {pair.shared.map((item) => (
          <p className="shared-note" key={`${item.kind}-${item.value}`}>
            {item.kind === 'ingredient' ? (
              <>Both contain <strong>{item.value}</strong>. Ask a pharmacist before taking both, so the total dose isn't too high.</>
            ) : (
              <>Both are <strong>{item.value}</strong>. Ask a pharmacist whether both are needed.</>
            )}
          </p>
        ))}
        {shown.map((finding) => <Quote key={finding.id} finding={finding} names={names} />)}
        {more.length > 0 && (
          <details className="more">
            <summary>Show {more.length} more label passage{more.length === 1 ? '' : 's'}</summary>
            {more.map((finding) => <Quote key={finding.id} finding={finding} names={names} />)}
          </details>
        )}
        {pair.findings.length > 0 && (
          <ExplainPanel
            medications={[first, second]}
            evidence={pair.findings.map((finding) => ({
              drug: names.get(finding.label_rxcui) ?? finding.label_drug,
              section: finding.section,
              text: finding.passage,
            }))}
          />
        )}
      </div>
    </article>
  )
}

function LabelRow({ medication }: { medication: CheckedMedication }) {
  const label = medication.label
  const date = formatLabelDate(label?.metadata.effective_time)
  const names = [...(label?.metadata.brand_name ?? []), ...(label?.metadata.generic_name ?? [])]
  const uniqueNames = names.filter(
    (name, index) => names.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index,
  )
  return (
    <details className="label-row">
      <summary>
        {medication.name}{' '}
        <span className="item-meta">{label ? (date ? `label date ${date}` : '') : 'no FDA label found'}</span>
      </summary>
      {label && (
        <div className="label-body">
          <p className="item-meta">
            {uniqueNames.join(' · ')}{uniqueNames.length > 0 && '. '}
            <a href={label.source_url} target="_blank" rel="noreferrer">Open on DailyMed</a>
          </p>
          {label.sections.length > 0 && (
            <ExplainPanel
              medications={[shortName(medication)]}
              evidence={label.sections.map((section) => ({
                drug: shortName(medication),
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

type Props = { result: CheckResponse; checkedAt: Date }

export default function CheckResults({ result, checkedAt }: Props) {
  const names: Names = new Map(result.medications.map((medication) => [medication.rxcui, shortName(medication)]))
  const flagged = result.pairs.filter((pair) => pair.status === 'evidence_found')
  const clear = result.pairs.filter((pair) => pair.status === 'no_evidence_found')
  const missing = result.medications.filter((medication) => !medication.label)
  const pairWord = result.pairs.length === 1 ? 'pair' : 'pairs'

  const serious = flagged.filter((pair) => pair.highest_severity === 'high').length
  const warnings = flagged.filter((pair) => pair.highest_severity === 'moderate').length
  const sameType = flagged.filter((pair) => !pair.highest_severity).length
  const counts: ReactNode[] = []
  if (serious) counts.push(<strong key="serious" className="text-serious">{serious} serious</strong>)
  if (warnings) counts.push(<strong key="warning" className="text-warning">{warnings} {warnings === 1 ? 'warning' : 'warnings'}</strong>)
  if (sameType) counts.push(<strong key="shared" className="text-shared">{sameType} same ingredient or type</strong>)

  return (
    <>
      <div className="results-head">
        <div>
          <h2>What the labels say</h2>
          <p className="results-meta">
            {result.medications.length} medications, {result.pairs.length} {pairWord} checked on{' '}
            {checkedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}. Labels from openFDA.
          </p>
        </div>
        <button type="button" className="button plain no-print" onClick={() => window.print()}>
          <PrinterIcon />Print for the pharmacist
        </button>
      </div>

      <p className="summary">
        {flagged.length > 0 ? (
          <>{flagged.length} of {result.pairs.length} {pairWord} need a closer look: {joined(counts)}.</>
        ) : (
          <>No label warnings found for {result.pairs.length === 1 ? 'this pair' : `these ${result.pairs.length} pairs`}.</>
        )}
      </p>

      {missing.length > 0 && (
        <p className="status">
          We couldn't find an FDA label for {missing.map((medication) => medication.name).join(', ')}. Pairs that
          include it were only checked against the other medicine's label.
        </p>
      )}

      {flagged.map((pair) => <PairCard key={pair.rxcuis.join('+')} pair={pair} names={names} />)}

      {clear.length > 0 && (
        <section className="panel clear-pairs" aria-labelledby="clear-heading">
          <h3 id="clear-heading">No label warning found for {clear.length} {clear.length === 1 ? 'pair' : 'pairs'}</h3>
          <p>That does not mean they are safe together. Labels don't list every interaction.</p>
          <ul>
            {clear.map((pair) => (
              <li key={pair.rxcuis.join('+')}>
                {pair.rxcuis.map((rxcui, index) => names.get(rxcui) ?? pair.medications[index]).join(' + ')}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel labels" aria-labelledby="labels-heading">
        <h3 id="labels-heading">Full FDA labels</h3>
        {result.medications.map((medication) => <LabelRow key={medication.rxcui} medication={medication} />)}
      </section>
    </>
  )
}
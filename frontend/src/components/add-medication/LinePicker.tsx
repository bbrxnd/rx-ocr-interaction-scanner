import { useState } from 'react'

type Props = {
  text: string
  onTextChange: (text: string) => void
  onSearch: (line: string) => void
}

// The medicine name is usually on the same line as its strength, e.g. "LISINOPRIL 10 MG TABLET"
const STRENGTH = /\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|%|units?)\b/i

function readLines(text: string): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => /[a-z]{3,}/i.test(line))
  return [...new Set(lines)].slice(0, 12)
}

export default function LinePicker({ text, onTextChange, onSearch }: Props) {
  const lines = readLines(text)
  const suggested = lines.find((line) => STRENGTH.test(line)) ?? lines[0] ?? ''
  const [picked, setPicked] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const chosen = picked !== null && lines.includes(picked) ? picked : suggested

  const textBox = (
    <textarea
      className="text-area"
      rows={6}
      value={text}
      onChange={(event) => onTextChange(event.target.value)}
      aria-label="Text read from the photo"
    />
  )

  if (!lines.length) {
    return (
      <div className="line-picker">
        <p className="status">No words were found in this photo. Try again with more light, or type the name below.</p>
        {textBox}
      </div>
    )
  }

  return (
    <div className="line-picker">
      <fieldset>
        <legend>Which line is the medicine?</legend>
        <p className="hint">
          We read {lines.length} {lines.length === 1 ? 'line' : 'lines'} from the photo. Lines with a dose are usually the drug.
        </p>
        <div className="line-options">
          {lines.map((line) => (
            <label key={line} className={line === chosen ? 'line-option chosen' : 'line-option'}>
              <input type="radio" name="photo-line" checked={line === chosen} onChange={() => setPicked(line)} />
              <span>{line}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="action-row">
        <button type="button" className="button primary" disabled={!chosen} onClick={() => onSearch(chosen)}>
          Search for this line
        </button>
        <button type="button" className="link-button" aria-expanded={editing} onClick={() => setEditing((open) => !open)}>
          {editing ? 'Done fixing' : 'Fix the text we read'}
        </button>
      </div>
      {editing && textBox}
    </div>
  )
}
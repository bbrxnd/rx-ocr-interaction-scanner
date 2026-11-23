import { useState } from 'react'
import { errorText, readJson } from './api'

type Props = { onUseLine: (line: string) => void }

// The medicine name is usually on the same line as its strength, e.g. "LISINOPRIL 10 MG TABLET"
const STRENGTH = /\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|%|units?)\b/i

function candidateLines(text: string): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => /[a-z]{4,}/i.test(line))
  const withStrength = lines.filter((line) => STRENGTH.test(line))
  return [...new Set(withStrength.length ? withStrength : lines)].slice(0, 6)
}

export default function PhotoScan({ onUseLine }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [scanned, setScanned] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const lines = candidateLines(text)

  function chooseFile(next: File | null) {
    setFile(next)
    setText('')
    setScanned(false)
    setError('')
  }

  async function readLabel() {
    if (!file || loading) return
    setLoading(true)
    setError('')
    setScanned(false)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/ocr', { method: 'POST', body: form })
      const body = await readJson<{ text: string }>(response)
      if (!response.ok) throw new Error(errorText(body, response, 'Reading the photo'))
      setText(body.text ?? '')
      setScanned(true)
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Could not reach the app server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="scan-panel">
      <label htmlFor="scan-file">Photo of a pill bottle or box</label>
      <div className="scan-controls">
        <input
          id="scan-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
        />
        <button type="button" className="button secondary" disabled={!file || loading} onClick={() => void readLabel()}>
          {loading ? 'Reading…' : 'Read label'}
        </button>
      </div>
      <p className="fine-print">
        JPEG, PNG or WebP, up to 10 MB. The photo is read on our server and not saved. The first scan can
        take a minute while the reader starts.
      </p>

      {error && <p className="status error" role="alert">{error}</p>}

      {scanned && (
        <div className="scan-result" aria-live="polite">
          {lines.length > 0 ? (
            <>
              <p>Which line names the medicine? Choose it to search.</p>
              <div className="line-choices">
                {lines.map((line) => (
                  <button key={line} type="button" className="chip" onClick={() => onUseLine(line)}>
                    {line}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="status">No text was found. Try a sharper photo, or type the name above.</p>
          )}
          <details>
            <summary>See or fix all the text we read</summary>
            <textarea
              rows={6}
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label="Text read from the photo"
            />
          </details>
        </div>
      )}
    </div>
  )
}

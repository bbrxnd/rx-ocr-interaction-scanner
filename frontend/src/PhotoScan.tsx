import { useRef, useState } from 'react'

type ScanResult = { text?: string; detail?: string }
type PhotoResult = { name: string; text: string; error: string }
type Props = { supported: string[]; onAdd: (names: string[]) => void }

export default function PhotoScan({ supported, onAdd }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<PhotoResult[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const generation = useRef(0)
  const detected = supported.filter(name => results.some(result => new RegExp(`\\b${name}\\b`, 'i').test(result.text)))

  function choose(next: File[]) {
    generation.current++
    setFiles(next)
    setResults([])
    setSelected([])
    setMessage('')
    setLoading(false)
  }

  async function scan() {
    if (!files.length) return
    const current = ++generation.current
    setLoading(true)
    setResults([])
    setSelected([])
    setMessage('')
    const scanned: PhotoResult[] = []
    for (const file of files) {
      if (current !== generation.current) return
      if (file.size > 10 * 1024 * 1024) {
        scanned.push({ name: file.name, text: '', error: 'Image exceeds 10 MB.' })
        continue
      }
      try {
        const form = new FormData()
        form.append('file', file)
        const response = await fetch('/api/ocr', { method: 'POST', body: form })
        const body = await response.json() as ScanResult
        if (!response.ok) throw new Error(body.detail ?? 'Could not scan this image.')
        scanned.push({ name: file.name, text: body.text ?? '', error: '' })
      } catch (err) {
        scanned.push({ name: file.name, text: '', error: err instanceof Error ? err.message : 'Could not reach the application API.' })
      }
    }
    if (current === generation.current) { setResults(scanned); setLoading(false) }
  }

  function edit(index: number, text: string) {
    setResults(previous => previous.map((result, i) => i === index ? { ...result, text } : result))
    setSelected([])
    setMessage('')
  }

  return <div className="photo-scan" aria-labelledby="scan-title">
    <h3 id="scan-title">Add from photos</h3>
    <p>Choose one or more clear photos of labels or medication lists. JPEG, PNG, and WebP are supported, up to 10 MB each. Images are processed locally and not retained after the request.</p>
    <p className="notice">OCR can miss or misread medications. Compare all extracted text with the photos, select only correct matches, and manually add any missing names. Do not enter personal information in the medication list.</p>
    <label htmlFor="scan-file">Choose photos</label>
    <input id="scan-file" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => choose(Array.from(event.target.files ?? []))} />
    <button type="button" disabled={!files.length || loading} onClick={() => void scan()}>{loading ? 'Scanning photos…' : 'Extract text'}</button>
    <div aria-live="polite">
      {results.map((result, index) => <div className="scan-result" key={`${index}-${result.name}`}>
        <label htmlFor={`scan-result-${index}`}>Extracted text from {result.name} — review and correct</label>
        {result.error ? <p className="status-message error-message">{result.error}</p> : <><textarea id={`scan-result-${index}`} rows={5} value={result.text} onChange={event => edit(index, event.target.value)} />{!result.text && <p className="field-hint">No text detected. Try another photo or enter names manually.</p>}</>}
      </div>)}
      {results.length > 0 && <div className="scan-matches">
        <strong>Possible matches in the supported ingredient list</strong>
        <p>Only exact names from the five supported ingredients are detected. Brand names, misspellings, and other medications may be missed.</p>
        {detected.length ? <><div>{detected.map(name => <label key={name}><input type="checkbox" checked={selected.includes(name)} onChange={event => { setSelected(previous => event.target.checked ? [...previous, name] : previous.filter(item => item !== name)); setMessage('') }} /> {name}</label>)}</div>
          <button type="button" disabled={!selected.length} onClick={() => { onAdd(selected); setSelected([]); setMessage('Selected ingredients added to the medication list below. Review the complete list before confirming.') }}>Add selected to list</button></> : <p>No supported ingredient names detected. Review the text and enter names manually.</p>}
        {message && <p role="status">{message}</p>}
      </div>}
    </div>
  </div>
}

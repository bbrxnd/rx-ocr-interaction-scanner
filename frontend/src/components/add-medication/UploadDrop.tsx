import { useState } from 'react'
import { UploadIcon } from '../icons'

type Props = { onChoose: (photo: File) => void }

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

export default function UploadDrop({ onChoose }: Props) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  function accept(file: File | undefined) {
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Use a JPEG, PNG or WebP photo.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Choose a photo under 10 MB.')
      return
    }
    setError('')
    onChoose(file)
  }

  return (
    <div
      className={dragging ? 'drop-zone dragging' : 'drop-zone'}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        accept(event.dataTransfer.files[0])
      }}
    >
      <UploadIcon size={28} />
      <p className="drop-title">Drag a photo of the label here</p>
      <p className="drop-or">or</p>
      {/* The real file input is hidden; the label below is the visible "button" for it */}
      <input
        id="photo-file"
        className="visually-hidden"
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={(event) => {
          accept(event.target.files?.[0])
          event.target.value = '' // lets the same file be chosen again
        }}
      />
      <label htmlFor="photo-file" className="button outline">Choose a photo</label>
      <p className="hint">JPEG, PNG or WebP, up to 10 MB</p>
      {error && <p className="status error" role="alert">{error}</p>}
    </div>
  )
}
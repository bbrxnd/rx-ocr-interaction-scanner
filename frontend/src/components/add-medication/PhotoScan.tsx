import { useEffect, useRef, useState } from 'react'
import CameraCapture from './CameraCapture'
import LinePicker from './LinePicker'
import UploadDrop from './UploadDrop'
import { readPhotoText } from '../../lib/api'
import { formatSize } from '../../lib/format'

type Props = {
  source: 'camera' | 'upload'
  onSearchLine: (line: string) => void
  onStopCamera: () => void
}

type Photo = { blob: Blob; name: string; url: string }

export default function PhotoScan({ source, onSearchLine, onStopCamera }: Props) {
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const latestRead = useRef(0) // ignore answers for a photo that was already replaced

  // Free the preview image when it is replaced or this panel closes
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url)
  }, [photo])

  async function readPhoto(blob: Blob, name: string) {
    const readId = ++latestRead.current
    setPhoto({ blob, name, url: URL.createObjectURL(blob) })
    setText(null)
    setError('')
    setReading(true)
    try {
      const result = await readPhotoText(blob, name)
      if (readId === latestRead.current) setText(result)
    } catch (readError) {
      if (readId === latestRead.current) {
        setError(readError instanceof Error ? readError.message : 'Could not reach the app server.')
      }
    } finally {
      if (readId === latestRead.current) setReading(false)
    }
  }

  function clearPhoto() {
    latestRead.current++
    setPhoto(null)
    setText(null)
    setError('')
    setReading(false)
  }

  if (!photo) {
    return source === 'camera' ? (
      <CameraCapture onCapture={(blob) => void readPhoto(blob, 'Camera photo.jpg')} onStop={onStopCamera} />
    ) : (
      <UploadDrop onChoose={(file) => void readPhoto(file, file.name)} />
    )
  }

  return (
    <div className="photo-result">
      <div className="photo-row">
        <img className="photo-thumb" src={photo.url} alt="The photo being read" />
        <div className="photo-info">
          <div className="item-name">{photo.name}</div>
          <div className="item-meta">{formatSize(photo.blob.size)}</div>
        </div>
        <button type="button" className="link-button" onClick={clearPhoto}>
          {source === 'camera' ? 'Retake' : 'Remove'}
        </button>
      </div>
      {reading && <p className="status">Reading the label… The first scan can take a minute.</p>}
      {error && <p className="status error" role="alert">{error}</p>}
      {text !== null && <LinePicker text={text} onTextChange={setText} onSearch={onSearchLine} />}
    </div>
  )
}
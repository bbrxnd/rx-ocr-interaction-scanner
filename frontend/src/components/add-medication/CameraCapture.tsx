import { useEffect, useRef, useState } from 'react'
import { CameraIcon, SwitchCameraIcon } from '../icons'

type Props = {
  onCapture: (photo: Blob) => void
  onStop: () => void
}

// Browsers only allow the camera on https:// pages and on localhost
const cameraAvailable =
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext

function cameraErrorText(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError') {
    return 'Camera access was blocked. Allow it from the camera icon in the address bar, or use Upload instead.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found. Use Upload instead.'
  if (name === 'NotReadableError') return 'Another app is using the camera. Close it and try again.'
  return 'The camera could not start. Use Upload instead.'
}

export default function CameraCapture({ onCapture, onStop }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [canSwitch, setCanSwitch] = useState(false)

  // Start the camera, and always turn it off again when this panel closes
  useEffect(() => {
    if (!cameraAvailable) return
    let stream: MediaStream | null = null
    let stopped = false

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play()
        }
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (!stopped) {
          setCanSwitch(devices.filter((device) => device.kind === 'videoinput').length > 1)
          setReady(true)
        }
      } catch (startError) {
        if (!stopped) setError(cameraErrorText(startError))
      }
    }

    void start()
    return () => {
      stopped = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [facing])

  function switchCamera() {
    setReady(false)
    setError('')
    setFacing((current) => (current === 'environment' ? 'user' : 'environment'))
  }

  function takePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) onCapture(blob)
    }, 'image/jpeg', 0.92)
  }

  if (!cameraAvailable) {
    return (
      <p className="status error" role="alert">
        The camera only works when this page is opened from localhost or an https:// address. Use Upload instead.
        On a phone, Upload also lets you take a photo.
      </p>
    )
  }

  return (
    <div className="camera">
      <div className="camera-view">
        <video ref={videoRef} playsInline muted aria-label="Live camera preview" />
        <div className="camera-frame" aria-hidden="true"><span /><span /><span /><span /></div>
        <p className="camera-hint">Fit the drug name inside the frame</p>
        {!ready && !error && <p className="camera-starting">Starting the camera…</p>}
      </div>
      {error && <p className="status error" role="alert">{error}</p>}
      <div className="camera-actions">
        <button type="button" className="button primary" disabled={!ready} onClick={takePhoto}>
          <CameraIcon size={18} />Take photo
        </button>
        {canSwitch && (
          <button type="button" className="button plain" onClick={switchCamera}>
            <SwitchCameraIcon />Switch camera
          </button>
        )}
      </div>
      <button type="button" className="link-button camera-off" onClick={onStop}>Turn off camera</button>
      <p className="hint">
        The live picture stays in this browser. Only the photo you take is sent to be read, and it isn't saved.
      </p>
    </div>
  )
}
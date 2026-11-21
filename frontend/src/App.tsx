import { useEffect, useState } from 'react'

type Health = { status: string; timestamp: string }

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Health>
      })
      .then(setHealth)
      .catch(() => setError(true))
  }, [])

  return (
    <main>
      <h1>Medication Interaction Explainer</h1>

      {error ? (
        <p>API status: unreachable (is the backend running?)</p>
      ) : health ? (
        <>
          <p>API status: {health.status}</p>
          <p>Checked: {new Date(health.timestamp).toLocaleString()}</p>
        </>
      ) : (
        <p>API status: loading</p>
      )}
    </main>
  )
}

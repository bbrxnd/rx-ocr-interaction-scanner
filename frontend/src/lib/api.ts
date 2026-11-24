/**
 * Read a JSON response body. Returns {} if the server sent something else,
 * such as a plain-text "Internal Server Error", so the page can show a clear message.
 */
export async function readJson<T>(response: Response): Promise<Partial<T> & { detail?: unknown }> {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

/** The backend's error message if it sent one, otherwise a generic one with the HTTP status. */
export function errorText(body: { detail?: unknown }, response: Response, action: string): string {
  return typeof body.detail === 'string' ? body.detail : `${action} failed (HTTP ${response.status}).`
}

/** Send a photo to the backend's OCR and get back the text it read. */
export async function readPhotoText(photo: Blob, fileName: string): Promise<string> {
  const form = new FormData()
  form.append('file', photo, fileName)
  const response = await fetch('/api/ocr', { method: 'POST', body: form })
  const body = await readJson<{ text: string }>(response)
  if (!response.ok) throw new Error(errorText(body, response, 'Reading the photo'))
  return body.text ?? ''
}
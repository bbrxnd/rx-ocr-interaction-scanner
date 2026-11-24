import type { Medication } from '../types'

// RxNorm term types in plain words
const KINDS: Record<string, string> = {
  IN: 'Generic ingredient',
  PIN: 'Ingredient (salt form)',
  MIN: 'Combination',
  BN: 'Brand',
  SCD: 'Generic product',
  SBD: 'Brand product',
  SCDF: 'Generic dose form',
  SBDF: 'Brand dose form',
  SCDC: 'Generic strength',
  GPCK: 'Generic pack',
  BPCK: 'Brand pack',
}

/** "Brand, contains ibuprofen" or "Generic product". */
export function describeConcept(name: string, tty: string, ingredients: string[]): string {
  const hidden = ingredients.filter((ingredient) => !name.toLowerCase().includes(ingredient.toLowerCase()))
  const kind = KINDS[tty] ?? tty
  return hidden.length ? `${kind}, contains ${hidden.join(', ')}` : kind
}

export function describeMedication(medication: Medication): string {
  const text = describeConcept(medication.name, medication.tty, medication.ingredients)
  return medication.source === 'photo' ? `${text}. Added from a photo` : text
}

/** A short name for results: "Advil" stays, "warfarin sodium 5 MG Oral Tablet" becomes "warfarin". */
export function shortName(medication: { name: string; ingredients: string[] }): string {
  return /\d/.test(medication.name) && medication.ingredients.length
    ? medication.ingredients.join(' / ')
    : medication.name
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "20261103" -> "Nov 3, 2026" */
export function formatLabelDate(value?: string | null): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null
  const date = new Date(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8)))
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
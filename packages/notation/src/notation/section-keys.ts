import type { ScoreDocument } from './score-document.js'
import { parseKey } from './m3n-primitives.js'

/** An optional target key belongs to this visit, never to the section's name. */
export function parseSectionOrderEntry(value: string) {
  const at = value.lastIndexOf('@')
  return at < 0 ? { name: value.trim() } : { name: value.slice(0, at).trim(), key: value.slice(at + 1).trim() }
}

export function sectionEntryKey(document: ScoreDocument, name: string) {
  return [...document.parts.values()].flatMap(part => part.melody)
    .find(measure => measure.sectionName === name && measure.events.length)?.events[0]?.key ?? document.key
}

export function sectionKeyVisits(document: ScoreDocument, name: string) {
  const entry = sectionEntryKey(document, name)
  return (document.order ?? []).flatMap((section, index) => section === name ? [document.orderKeys?.[index] ?? entry] : [])
}

export function keyLabel(key: string) {
  const { tonic, mode } = parseKey(key)
  return `${mode === 'm' ? 6 : 1}=${tonic.replace('#', '♯').replace('b', '♭')}${mode && mode !== 'm' ? ` ${mode}` : ''}`
}

export function sectionOrderLabels(document: ScoreDocument, label = keyLabel) {
  const keyed = new Set((document.order ?? []).filter((_, index) => document.orderKeys?.[index] !== undefined))
  return document.order?.map((name, index) => keyed.has(name)
    ? `${name}（${label(document.orderKeys?.[index] ?? sectionEntryKey(document, name))}）` : name)
}

/** Transpose internal modulations by the same interval, keeping the mode. */
export function sectionVisitKey(key: string, entryKey: string, targetKey: string) {
  if (key === entryKey) return targetKey
  const chroma = (tonic: string) => ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[tonic[0]!] ?? 0)
    + (tonic.endsWith('#') ? 1 : tonic.endsWith('b') ? -1 : 0)
  const entry = parseKey(entryKey), target = parseKey(targetKey), current = parseKey(key)
  const pitch = ((chroma(current.tonic) + chroma(target.tonic) - chroma(entry.tonic)) % 12 + 12) % 12
  return ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][pitch]! + current.mode
}

import { assessM3NMelodyComplexity } from './m3n-melody-complexity'
import { validateM3NDiagnostics } from './m3n-validate'
import { scoreDiagnosticSeverity, type ScoreDiagnosticSeverity } from './score-diagnostics'

export type PresetScoreMetadata = {
  slug: string
  title: string
  subtitle?: string
  singer?: string
  composer?: string
  keySignature: string
  timeSignature: string
  tempo: number
  hasLyrics: boolean
  hasBass: boolean
  melodyComplexity: number
  searchText: string
  diagnosticSeverity: ScoreDiagnosticSeverity
}

function readAttribute(source: string, name: string) {
  return new RegExp(`\\{${name}=([^}]+)\\}`).exec(source)?.[1].trim()
}

function readTimeSignature(source: string) {
  return source.match(/\{(\d+\/\d+)\}/)?.[1] ?? '4/4'
}

function readTempo(source: string) {
  const match = source.match(/\{(\d+)qpm\}/)
  return match ? Number(match[1]) : 120
}

const notationAttributeNames = new Set(['key', '1', 'transpose', 'form', 'parts', 'part', 'rest', 'chord', 'lyrics'])

function readMetadataValues(source: string) {
  return Array.from(source.matchAll(/\{([^=}\s]+)=([^}]*)\}/g))
    .filter((match) => !notationAttributeNames.has(match[1]))
    .map((match) => match[2].trim())
    .filter(Boolean)
}

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase('zh-Hans-CN').replace(/\s+/g, ' ').trim()
}

export function scoreMetadataFromSource(slug: string, source: string): PresetScoreMetadata {
  const title = readAttribute(source, 'title') ?? slug
  const subtitle = readAttribute(source, 'subtitle')
  const singer = readAttribute(source, 'singer')
  const composer = readAttribute(source, 'composer')
  return {
    slug,
    title,
    subtitle,
    singer,
    composer,
    keySignature: readAttribute(source, 'key') ?? 'C',
    timeSignature: readTimeSignature(source),
    tempo: readTempo(source),
    hasLyrics: /^\s*L\d*:/m.test(source),
    hasBass: /^\s*B:/m.test(source),
    melodyComplexity: assessM3NMelodyComplexity(source).score,
    searchText: normalizeSearchText([title, subtitle, singer, composer, ...readMetadataValues(source)].filter(Boolean).join(' ')),
    diagnosticSeverity: scoreDiagnosticSeverity(validateM3NDiagnostics(source)),
  }
}

import { analyzeM3N } from './notation/analysis.js' 
import { scoreDiagnosticSeverity, type ScoreDiagnosticSeverity } from './score-diagnostics.js'

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

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase('zh-Hans-CN').replace(/\s+/g, ' ').trim()
}

export function scoreMetadataFromSource(slug: string, source: string): PresetScoreMetadata {
  const analysis = analyzeM3N(source)
  const { score, projection } = analysis
  const title = score.title || slug
  const hasLyrics = projection.structure.sections.some((section) => section.phrases.some((phrase) => phrase.lyrics.length > 0))
  const hasBass = projection.structure.sections.some((section) => section.phrases.some((phrase) => phrase.bass !== undefined))
  return {
    slug,
    title,
    subtitle: score.subtitle || undefined,
    singer: score.singer || undefined,
    composer: score.composer || undefined,
    keySignature: score.key,
    timeSignature: `${score.meterCount}/${score.meterUnit}`,
    tempo: score.tempo,
    hasLyrics,
    hasBass,
    melodyComplexity: analysis.complexity.score,
    searchText: normalizeSearchText([
      title,
      score.subtitle,
      score.singer,
      score.composer,
      score.lyricist,
      score.arranger,
      score.copyright,
      score.source,
      score.note,
    ].filter(Boolean).join(' ')),
    diagnosticSeverity: scoreDiagnosticSeverity(analysis.conversion.diagnostics),
  }
}

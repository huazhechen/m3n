import { parseM3NSyntaxTree } from './syntax-tree'
import { createScoreDiagnostic, type ScoreDiagnostic } from './diagnostics'

export type M3NPhrase = {
  line: number
  passes: string
  melody?: { text: string; start: number; line: number }
  bass?: { text: string; start: number; line: number }
  harmony?: { text: string; start: number; line: number }
  lyrics: Array<{ label: string; text: string; start: number }>
}

export type M3NSection = {
  name: string
  line: number
  phrases: M3NPhrase[]
}

export type M3NDocumentStructure = {
  header: string
  sections: M3NSection[]
  diagnostics: ScoreDiagnostic[]
}

const linePrefix = /^(N|B|C|L\d*):(?:[ \t]?)(.*)$/
const phraseEndingBar = /(?:\|\|:|:\|\|:|:\|\|\||:\|\||\|\|\||\|\||\|)(?:\{x\d+\})?\s*(?:\/\/.*)?$/
const nonAlignmentBar = /\|\||:\|\|/

export function parseM3NDocumentStructure(source: string): M3NDocumentStructure {
  const diagnostics: ScoreDiagnostic[] = []
  const rootSection: M3NSection = { name: '', line: 1, phrases: [] }
  const sections: M3NSection[] = [rootSection]
  const header: string[] = []
  let section = rootSection
  let phrase: M3NPhrase | undefined
  let musicSeen = false

  const ensurePhrase = (line: number, passes = '') => {
    phrase ??= { line, passes, lyrics: [] }
    if (!section.phrases.includes(phrase)) section.phrases.push(phrase)
    return phrase
  }

  const syntaxTree = parseM3NSyntaxTree(source)
  const report = (line: number, code: string, message: string) => {
    const syntaxLine = syntaxTree.lines[line - 1]
    diagnostics.push(createScoreDiagnostic({
      code,
      message,
      range: syntaxLine ? { start: syntaxLine.start, end: syntaxLine.end } : undefined,
      legacyMessage: `第 ${line} 行：${message}`,
    }))
  }
  for (const syntaxLine of syntaxTree.lines) {
    const rawLine = syntaxLine.raw
    const line = syntaxLine.line
    const trimmed = rawLine.trim()
    const leading = rawLine.length - rawLine.trimStart().length
    const contentStart = syntaxLine.start + leading
    if (!trimmed || trimmed.startsWith('//')) {
      if (!musicSeen) header.push(rawLine)
      continue
    }
    const sectionMatch = /^===\s*(.*)$/.exec(trimmed)
    if (sectionMatch) {
      musicSeen = true
      if (phrase && !phrase.melody) report(line, 'M3N_STRUCTURE_MISSING_MELODY', '=== 前的乐句缺少 N: 旋律行')
      phrase = undefined
      const name = sectionMatch[1]?.trim() ?? ''
      section = { name, line, phrases: [] }
      if (sections.length === 1 && sections[0]?.phrases.length === 0 && !sections[0]?.name) sections[0] = section
      else sections.push(section)
      continue
    }
    const phraseMatch = /^---(?:V(\d+(?:\s*,\s*V?\d+)*))?$/.exec(trimmed)
    if (phraseMatch) {
      musicSeen = true
      phrase = { line, passes: phraseMatch[1]?.replace(/\s*V?\s*/g, '') ?? '', lyrics: [] }
      section.phrases.push(phrase)
      continue
    }
    const prefixed = linePrefix.exec(trimmed)
    if (prefixed) {
      musicSeen = true
      const current = ensurePhrase(line)
      const kind = prefixed[1] ?? ''
      const text = prefixed[2] ?? ''
      const start = contentStart + trimmed.indexOf(text)
      if (kind === 'N') {
        if (current.melody) report(line, 'M3N_STRUCTURE_DUPLICATE_MELODY', '同一乐句只能有一个 N: 行')
        current.melody = { text, start, line }
      } else if (kind === 'B') {
        if (current.bass) report(line, 'M3N_STRUCTURE_DUPLICATE_BASS', '同一乐句只能有一个 B: 行')
        current.bass = { text, start, line }
      } else if (kind === 'C') {
        if (current.harmony) report(line, 'M3N_STRUCTURE_DUPLICATE_HARMONY', '同一乐句只能有一个 C: 行')
        current.harmony = { text, start, line }
      } else {
        current.lyrics.push({ label: kind.slice(1), text, start })
      }
      if (kind !== 'N' && nonAlignmentBar.test(text)) report(line, 'M3N_STRUCTURE_INVALID_ALIGNMENT_BAR', `${kind}: 只允许使用普通 | 作为小节对位标记`)
      continue
    }
    if (!musicSeen) header.push(rawLine)
    else report(line, 'M3N_STRUCTURE_UNKNOWN_ROW', `正文必须写在 N:、B:、C: 或 L: 行中：${trimmed}`)
  }

  if (!musicSeen) return { header: source, sections: [], diagnostics: [] }
  for (const currentSection of sections) {
    if (currentSection.phrases.length === 0) report(currentSection.line, 'M3N_STRUCTURE_EMPTY_SECTION', '乐段至少需要一个乐句')
    for (const currentPhrase of currentSection.phrases) {
      if (!currentPhrase.melody) report(currentPhrase.line, 'M3N_STRUCTURE_MISSING_MELODY', '乐句缺少 N: 旋律行')
      else if (!phraseEndingBar.test(currentPhrase.melody.text)) report(currentPhrase.melody.line, 'M3N_STRUCTURE_MISSING_FINAL_BAR', '每个 N: 乐句必须以小节线结束')
      const labels = currentPhrase.lyrics.map((lyric) => lyric.label)
      if (labels.includes('') && labels.some(Boolean)) report(currentPhrase.line, 'M3N_STRUCTURE_MIXED_LYRIC_LABELS', 'L: 与编号歌词行不能混用')
      if (new Set(labels).size !== labels.length) report(currentPhrase.line, 'M3N_STRUCTURE_DUPLICATE_LYRIC', '同一乐句不能重复相同的歌词行')
    }
  }
  return { header: header.join('\n'), sections, diagnostics }
}

export function projectM3NDocument(source: string) {
  const structure = parseM3NDocumentStructure(source)
  const melody: string[] = []
  const lineMap: number[] = []
  const phrasePasses: Array<{ start: number; end: number; passes: string }> = []
  let projectedLength = 0
  const push = (text: string, sourceLine?: number) => {
    if (melody.length > 0) projectedLength += 1
    const start = projectedLength
    melody.push(text)
    projectedLength += text.length
    const lineCount = text.split('\n').length
    for (let index = 0; index < lineCount; index += 1) lineMap.push(sourceLine ?? lineMap.length + 1)
    return start
  }
  push(structure.header)
  const bass: string[] = []
  for (const section of structure.sections) {
    for (const phrase of section.phrases) {
      if (phrase.melody) {
        const start = push(phrase.melody.text, phrase.melody.line)
        if (phrase.passes) phrasePasses.push({ start, end: start + phrase.melody.text.length, passes: phrase.passes })
      }
      if (phrase.bass) bass.push(phrase.bass.text)
    }
  }
  return { source: melody.join('\n'), bassSource: bass.join('\n'), structure, lineMap, phrasePasses }
}

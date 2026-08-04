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
  diagnostics: string[]
}

const linePrefix = /^(N|B|C|L\d*):(?:[ \t]?)(.*)$/
const phraseEndingBar = /(?:\|\|:|:\|\|:|:\|\|\||:\|\||\|\|\||\|\||\|)(?:\{x\d+\})?\s*(?:\/\/.*)?$/
const nonAlignmentBar = /\|\||:\|\|/

export function parseM3NDocumentStructure(source: string): M3NDocumentStructure {
  const diagnostics: string[] = []
  const sections: M3NSection[] = [{ name: '', line: 1, phrases: [] }]
  const header: string[] = []
  let section = sections[0]!
  let phrase: M3NPhrase | undefined
  let offset = 0
  let musicSeen = false

  const ensurePhrase = (line: number, passes = '') => {
    phrase ??= { line, passes, lyrics: [] }
    if (!section.phrases.includes(phrase)) section.phrases.push(phrase)
    return phrase
  }

  const lines = source.split(/\r?\n/)
  for (const [index, rawLine] of lines.entries()) {
    const line = index + 1
    const trimmed = rawLine.trim()
    const leading = rawLine.length - rawLine.trimStart().length
    const contentStart = offset + leading
    if (!trimmed || trimmed.startsWith('//')) {
      if (!musicSeen) header.push(rawLine)
      offset += rawLine.length + 1
      continue
    }
    const sectionMatch = /^===\s*(.*)$/.exec(trimmed)
    if (sectionMatch) {
      musicSeen = true
      if (phrase && !phrase.melody) diagnostics.push(`第 ${line} 行：=== 前的乐句缺少 N: 旋律行`)
      phrase = undefined
      const name = sectionMatch[1]?.trim() ?? ''
      section = { name, line, phrases: [] }
      if (sections.length === 1 && sections[0]?.phrases.length === 0 && !sections[0]?.name) sections[0] = section
      else sections.push(section)
      offset += rawLine.length + 1
      continue
    }
    const phraseMatch = /^---(?:V(\d+(?:\s*,\s*V?\d+)*))?$/.exec(trimmed)
    if (phraseMatch) {
      musicSeen = true
      phrase = { line, passes: phraseMatch[1]?.replace(/\s*V?\s*/g, '') ?? '', lyrics: [] }
      section.phrases.push(phrase)
      offset += rawLine.length + 1
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
        if (current.melody) diagnostics.push(`第 ${line} 行：同一乐句只能有一个 N: 行`)
        current.melody = { text, start, line }
      } else if (kind === 'B') {
        if (current.bass) diagnostics.push(`第 ${line} 行：同一乐句只能有一个 B: 行`)
        current.bass = { text, start, line }
      } else if (kind === 'C') {
        if (current.harmony) diagnostics.push(`第 ${line} 行：同一乐句只能有一个 C: 行`)
        current.harmony = { text, start, line }
      } else {
        current.lyrics.push({ label: kind.slice(1), text, start })
      }
      if (kind !== 'N' && nonAlignmentBar.test(text)) diagnostics.push(`第 ${line} 行：${kind}: 只允许使用普通 | 作为小节对位标记`)
      offset += rawLine.length + 1
      continue
    }
    if (!musicSeen) header.push(rawLine)
    else diagnostics.push(`第 ${line} 行：正文必须写在 N:、B:、C: 或 L: 行中：${trimmed}`)
    offset += rawLine.length + 1
  }

  if (!musicSeen) return { header: source, sections: [], diagnostics: [] }
  for (const currentSection of sections) {
    if (currentSection.phrases.length === 0) diagnostics.push(`第 ${currentSection.line} 行：乐段至少需要一个乐句`)
    for (const currentPhrase of currentSection.phrases) {
      if (!currentPhrase.melody) diagnostics.push(`第 ${currentPhrase.line} 行：乐句缺少 N: 旋律行`)
      else if (!phraseEndingBar.test(currentPhrase.melody.text)) diagnostics.push(`第 ${currentPhrase.melody.line} 行：每个 N: 乐句必须以小节线结束`)
      const labels = currentPhrase.lyrics.map((lyric) => lyric.label)
      if (labels.includes('') && labels.some(Boolean)) diagnostics.push(`第 ${currentPhrase.line} 行：L: 与编号歌词行不能混用`)
      if (new Set(labels).size !== labels.length) diagnostics.push(`第 ${currentPhrase.line} 行：同一乐句不能重复相同的歌词行`)
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

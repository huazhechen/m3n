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
  form: string[]
  sections: M3NSection[]
  diagnostics: string[]
}

const linePrefix = /^(N|B|C|L\d*):(?:[ \t]?)(.*)$/

export function parseM3NDocumentStructure(source: string): M3NDocumentStructure {
  const diagnostics: string[] = []
  const sections: M3NSection[] = [{ name: '', line: 1, phrases: [] }]
  const header: string[] = []
  const formMatch = source.match(/\{form=([^}]*)\}/)
  const form = formMatch?.[1]?.split(',').map((name) => name.trim()).filter(Boolean) ?? []
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
      offset += rawLine.length + 1
      continue
    }
    if (!musicSeen) header.push(rawLine)
    else diagnostics.push(`第 ${line} 行：正文必须写在 N:、B:、C: 或 L: 行中：${trimmed}`)
    offset += rawLine.length + 1
  }

  if (!musicSeen) return { header: source, form, sections: [], diagnostics: [] }
  for (const currentSection of sections) {
    if (currentSection.phrases.length === 0) diagnostics.push(`第 ${currentSection.line} 行：乐段至少需要一个乐句`)
    for (const currentPhrase of currentSection.phrases) {
      if (!currentPhrase.melody) diagnostics.push(`第 ${currentPhrase.line} 行：乐句缺少 N: 旋律行`)
      const labels = currentPhrase.lyrics.map((lyric) => lyric.label)
      if (labels.includes('') && labels.some(Boolean)) diagnostics.push(`第 ${currentPhrase.line} 行：L: 与编号歌词行不能混用`)
      if (new Set(labels).size !== labels.length) diagnostics.push(`第 ${currentPhrase.line} 行：同一乐句不能重复相同的歌词行`)
    }
  }
  const named = sections.map(({ name }) => name).filter(Boolean)
  if (named.length > 0) {
    if (form.length > 0) {
      if (named.length !== sections.length) diagnostics.push('具名乐段与未命名乐段不能混用')
      if (new Set(named).size !== named.length) diagnostics.push('乐段名称不能重复')
      for (const name of named) if (!form.includes(name)) diagnostics.push(`乐段 ${name} 未被 form 引用`)
      for (const name of form) if (!named.includes(name)) diagnostics.push(`form 引用了未定义的乐段 ${name}`)
    }
  } else if (form.length > 0) diagnostics.push('form 只能引用具名乐段')

  return { header: header.join('\n'), form, sections, diagnostics }
}

export function projectM3NDocument(source: string) {
  const structure = parseM3NDocumentStructure(source)
  const named = structure.sections.length > 0 && structure.sections.every((section) => Boolean(section.name))
  const usesForm = named && structure.form.length > 0
  const order = structure.form
  const melody: string[] = []
  const lineMap: number[] = []
  const push = (text: string, sourceLine?: number) => {
    melody.push(text)
    const lineCount = text.split('\n').length
    for (let index = 0; index < lineCount; index += 1) lineMap.push(sourceLine ?? lineMap.length + 1)
  }
  push(structure.header.replace(/\{form=[^}]*\}/g, ''))
  if (usesForm) push(`{parts=${order.join(' ')}}`)
  const bass: string[] = []
  const lyrics = new Map<string, string[]>()
  for (const [sectionIndex, section] of structure.sections.entries()) {
    if (usesForm) push(`{part=${section.name}}${sectionIndex > 0 ? '{br}' : ''}`, section.line)
    for (const [phraseIndex, phrase] of section.phrases.entries()) {
      if (phrase.passes) push(`{ending=${phrase.passes}}`, phrase.melody?.line ?? phrase.line)
      if (phrase.melody) {
        const closesBeforeBar = phrase.passes ? '{/}' : ''
        const closesPart = usesForm && phraseIndex === section.phrases.length - 1 ? '{/}' : ''
        let text = closesBeforeBar
          ? phrase.melody.text.replace(/((?::\|\|\||:\|\||\|\|\||\|\||\|)(?:\{x\d+\})?)\s*$/, `${closesBeforeBar}$1`)
          : phrase.melody.text
        if (closesBeforeBar && text === phrase.melody.text) text = `${text} ${closesBeforeBar}`
        if (closesPart && /(?::\|\|\||\|\|\|)(?:\{x\d+\})?\s*$/.test(text)) {
          text = text.replace(/((?::\|\|\||\|\|\|)(?:\{x\d+\})?)\s*$/, `${closesPart}$1`)
        } else if (closesPart) text = `${text} ${closesPart}`
        push(text, phrase.melody.line)
      }
      if (phrase.bass) bass.push(phrase.bass.text)
      for (const lyric of phrase.lyrics) {
        const rows = lyrics.get(lyric.label) ?? []
        const reference = /^\{L(\d+)\}$/.exec(lyric.text.trim())
        if (reference) continue
        rows.push(lyric.text.replace(/\s*\|\s*/g, ' '))
        lyrics.set(lyric.label, rows)
      }
    }
  }
  for (const [label, rows] of lyrics) push(`{lyrics${label ? `=${label}` : ''}}${rows.join(' ')}{/}`)
  if (bass.length > 0) push(`{bass}${bass.join(' ')}{/}`)
  return { source: melody.join('\n'), structure, lineMap }
}

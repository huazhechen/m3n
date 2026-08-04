import { tokenizeM3N, type M3NToken } from './m3n-tokens'

export type SourceSpan = {
  start: number
  end: number
  line: number
  column: number
}

export type M3NRowKind = 'melody' | 'bass' | 'harmony' | 'lyrics'

export type M3NSyntaxRow = SourceSpan & {
  kind: M3NRowKind
  label: string
  content: string
  contentStart: number
  tokens: M3NToken[]
}

export type M3NSyntaxLine = SourceSpan & {
  raw: string
  kind: 'blank' | 'comment' | 'header' | 'section' | 'phrase' | 'row' | 'unknown'
  row?: M3NSyntaxRow
}

export type M3NSyntaxTree = SourceSpan & {
  kind: 'document'
  source: string
  lines: M3NSyntaxLine[]
  tokens: M3NToken[]
}

const rowPattern = /^(N|B|C|L\d*):(?:[ \t]?)(.*)$/

/** Lossless, error-tolerant syntax model. Unknown input remains represented in the tree. */
export function parseM3NSyntaxTree(source: string): M3NSyntaxTree {
  const tokens = tokenizeM3N(source)
  const lines: M3NSyntaxLine[] = []
  let offset = 0
  let musicSeen = false
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const line = index + 1
    const leading = raw.length - raw.trimStart().length
    const trimmed = raw.trim()
    const span = { start: offset, end: offset + raw.length, line, column: 1 }
    const match = rowPattern.exec(raw.trimStart())
    if (!trimmed) lines.push({ ...span, raw, kind: 'blank' })
    else if (trimmed.startsWith('//')) lines.push({ ...span, raw, kind: 'comment' })
    else if (/^===/.test(trimmed)) {
      musicSeen = true
      lines.push({ ...span, raw, kind: 'section' })
    } else if (/^---/.test(trimmed)) {
      musicSeen = true
      lines.push({ ...span, raw, kind: 'phrase' })
    } else if (match) {
      musicSeen = true
      const label = match[1] ?? ''
      const content = match[2] ?? ''
      const contentStart = offset + leading + raw.trimStart().indexOf(content)
      const contentEnd = contentStart + content.length
      const kind: M3NRowKind = label === 'N' ? 'melody' : label === 'B' ? 'bass' : label === 'C' ? 'harmony' : 'lyrics'
      const row: M3NSyntaxRow = {
        start: offset + leading,
        end: offset + raw.length,
        line,
        column: leading + 1,
        kind,
        label,
        content,
        contentStart,
        tokens: tokens.filter((token) => contentStart <= token.start && token.start < contentEnd),
      }
      lines.push({ ...span, raw, kind: 'row', row })
    } else lines.push({ ...span, raw, kind: musicSeen ? 'unknown' : 'header' })
    offset += raw.length + (source[offset + raw.length] === '\r' ? 2 : source[offset + raw.length] === '\n' ? 1 : 0)
  }
  return { kind: 'document', source, start: 0, end: source.length, line: 1, column: 1, lines, tokens }
}

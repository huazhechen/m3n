import { splitInlineComment, appendComment, mapLiteralSafe } from './text.js'

/** Places a navigation marker on the barline it concludes. */
function collapseBarlines(source: string) {
  return source
    .replace(/(?:\|\||\|)\s+(?=:\|\|)/g, '')
    .replace(/:\|\|\s*\|\|\|/g, ':|||')
    .replace(/\|{1,3}(?:\s+\|{1,3})+/g, (run) => {
      const width = Math.max(...(run.match(/\|+/g) ?? ['|']).map((bar) => bar.length))
      return '|'.repeat(width)
    })
}

function normalizeWhitespaceOutsideDirectives(value: string) {
  let result = ''
  let directive = ''
  let inDirective = false
  let whitespace = false

  for (const character of value.trim()) {
    if (inDirective) {
      directive += character
      if (character === '}') {
        result += directive
        directive = ''
        inDirective = false
      }
      continue
    }
    if (character === '{') {
      if (whitespace && result) result += ' '
      whitespace = false
      directive = character
      inDirective = true
      continue
    }
    if (/\s/.test(character)) {
      whitespace = true
      continue
    }
    if (whitespace && result) result += ' '
    whitespace = false
    result += character
  }

  return result + directive
}

export function normalizeLyricWhitespace(value: string) {
  return mapLiteralSafe(value.trim(), (text) => text.replace(/[ \t]+/g, (whitespace, offset) => {
    const previous = text.slice(0, offset).at(-1) ?? ''
    const next = text[offset + whitespace.length] ?? ''
    return /[A-Za-z0-9]/.test(previous) || /[A-Za-z0-9]/.test(next) ? ' ' : ''
  }).replace(/%(?:\s*%)+/g, (run) => `{%${(run.match(/%/g) ?? []).length}}`), true)
}

function formatContent(value: string, lyric = false) {
  const { content, comment } = splitInlineComment(value)
  const formatted = lyric ? normalizeLyricWhitespace(content) : normalizeWhitespaceOutsideDirectives(content)
  return appendComment(formatted, comment)
}

function formatLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('//')) return trimmed

  const phraseLine = /^(N|B|C|L\d*):\s*(.*)$/.exec(trimmed)
  if (phraseLine) {
    const kind = phraseLine[1] ?? ''
    const source = phraseLine[2] ?? ''
    const music = kind === 'N' || kind === 'B'
      ? normalizeMusic(source)
      : source
    return `${kind}: ${formatContent(music, kind.startsWith('L'))}`.trimEnd()
  }

  const phraseSeparator = /^---\s*(V\d+(?:\s*,\s*V\d+)*)?\s*$/.exec(trimmed)
  if (phraseSeparator) return `---${(phraseSeparator[1] ?? '').replace(/\s+/g, '')}`

  const partSeparator = /^===\s*(.*)$/.exec(trimmed)
  if (partSeparator) return `===${partSeparator[1]?.trim() ?? ''}`

  return formatContent(trimmed)
}

export function normalizeAdjacentBarlines(source: string) {
  return mapLiteralSafe(source, collapseBarlines)
}

function normalizeMusic(source: string) {
  // Directive contents, including manual breaks, are part of the rendered score.
  const { content, comment } = splitInlineComment(source)
  const music = content.split(/(\{[^}]*\})/g).map((chunk, index) => index % 2
    ? chunk
    : collapseBarlines(chunk)).join('').replace(/^\s*\|{1,3}(?=\s|$)\s*/, '')
  return appendComment(music.trimEnd(), comment)
}

export function normalizeLayout(source: string) {
  return source.split('\n').map(formatLine).filter(Boolean).join('\n') + '\n'
}

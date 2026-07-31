export type M3NTokenKind =
  | 'space'
  | 'comment'
  | 'attribute'
  | 'bar'
  | 'open-paren'
  | 'close-paren'
  | 'group'
  | 'note'
  | 'unknown'

export type M3NToken = {
  kind: M3NTokenKind
  raw: string
  line: number
  start: number
  content?: string
}

const BAR_PATTERN = /^(?::\|\|\||:\|\|:|:\|\||\|\|:|\|\|\||\|\||\|)/
const NOTE_PATTERN = /^[0-7][#b=ed^.~]*/

/** Tokenize source without assigning syntactic or musical meaning to tokens. */
export function tokenizeM3N(source: string): M3NToken[] {
  const tokens: M3NToken[] = []
  let index = 0
  let line = 1

  const push = (kind: M3NTokenKind, raw: string, content?: string) => {
    tokens.push({ kind, raw, line, start: index, content })
    line += raw.split('\n').length - 1
    index += raw.length
  }

  while (index < source.length) {
    const rest = source.slice(index)
    const space = /^\s+/.exec(rest)?.[0]
    if (space) { push('space', space); continue }
    if (rest.startsWith('//')) {
      const end = rest.indexOf('\n')
      push('comment', end === -1 ? rest : rest.slice(0, end))
      continue
    }
    if (rest.startsWith('{')) {
      const end = rest.indexOf('}')
      if (end !== -1) {
        const raw = rest.slice(0, end + 1)
        push('attribute', raw, raw.slice(1, -1))
      } else push('unknown', rest)
      continue
    }
    const bar = BAR_PATTERN.exec(rest)?.[0]
    if (bar) { push('bar', bar); continue }
    if (rest[0] === '(') { push('open-paren', '('); continue }
    if (rest[0] === ')') { push('close-paren', ')'); continue }
    if (rest[0] === '[') {
      const end = rest.indexOf(']')
      if (end !== -1) {
        const suffix = /^(?:\^*)(?:\.*)(?:~?)/.exec(rest.slice(end + 1))?.[0] ?? ''
        push('group', rest.slice(0, end + 1 + suffix.length))
      } else {
        const raw = /^[^\s|{}()]*/.exec(rest)?.[0] || '['
        push('unknown', raw)
      }
      continue
    }
    const note = NOTE_PATTERN.exec(rest)?.[0]
    if (note) { push('note', note); continue }
    const unknown = /^[^\s|{}()[\]]+/.exec(rest)?.[0] ?? rest[0]
    push('unknown', unknown)
  }

  return tokens
}

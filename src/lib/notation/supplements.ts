export type LyricBlock = {
  range: string
  text: string
}

export type SupplementBlocks = {
  main: string
  bass: string
  lyrics: LyricBlock[]
}

const NESTED_BLOCK = /^(?:cresc|decres|lg|8va|8vb|volta=|part=)/

/** Split top-level supplement blocks while respecting interval blocks inside bass. */
export function splitSupplementBlocks(source: string): SupplementBlocks {
  const lyrics: LyricBlock[] = []
  const main: string[] = []
  let bass = ''
  let index = 0

  while (index < source.length) {
    const rest = source.slice(index)
    const opener = /^\{(lyrics)(?:=([^}]+))?\}|^\{(bass)\}/.exec(rest)
    if (!opener) {
      main.push(source[index])
      index += 1
      continue
    }

    const kind = opener[1] ? 'lyrics' : 'bass'
    const range = opener[2] ?? ''
    const contentStart = index + opener[0].length
    let cursor = contentStart
    const nested: string[] = []
    let contentEnd = source.length
    let closeEnd = source.length

    while (cursor < source.length) {
      if (source.startsWith('//', cursor)) {
        const newline = source.indexOf('\n', cursor)
        cursor = newline === -1 ? source.length : newline + 1
        continue
      }
      if (source[cursor] !== '{') {
        cursor += 1
        continue
      }
      const braceEnd = source.indexOf('}', cursor)
      if (braceEnd === -1) break
      const attribute = source.slice(cursor + 1, braceEnd)
      if (NESTED_BLOCK.test(attribute)) {
        nested.push(attribute.startsWith('volta=') ? 'volta' : attribute.startsWith('part=') ? 'part' : attribute)
      } else if (attribute === '/' || attribute.startsWith('/')) {
        const named = attribute === '/' ? null : attribute.slice(1)
        if (nested.length > 0) {
          const expected = nested.at(-1)
          if (named === null || named === expected) nested.pop()
        } else if (named === null || named === kind) {
          contentEnd = cursor
          closeEnd = braceEnd + 1
          break
        }
      }
      cursor = braceEnd + 1
    }

    const text = source.slice(contentStart, contentEnd).trim()
    if (kind === 'lyrics') lyrics.push({ range, text })
    else bass = text
    index = closeEnd
  }

  return { main: main.join(''), bass, lyrics }
}

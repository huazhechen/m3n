export type LyricMode = 'char' | 'word'
export type ParsedLyricItem = {
  text: string
  sourceStart: number
  sourceEnd: number
  forceTiedTarget: boolean
  kind: 'text' | 'placeholder' | 'extender'
  underlined: boolean
  wordpos?: 'i' | 'm' | 't'
}

const punctuation = /^\p{P}+$/u

function addPunctuation(items: ParsedLyricItem[], value: string) {
  const previous = items.at(-1)
  if (previous?.kind === 'text') previous.text += value
}

function addItem(items: ParsedLyricItem[], text: string, sourceStart: number, sourceEnd: number, forceTiedTarget: boolean, underlined = false, wordpos?: ParsedLyricItem['wordpos']) {
  items.push({ text, sourceStart, sourceEnd, forceTiedTarget, kind: 'text', underlined, wordpos })
}

function parseUnit(items: ParsedLyricItem[], raw: string, sourceStart: number, forceTiedTarget: boolean, mode: LyricMode) {
  if (raw === '%') {
    items.push({ text: '%', sourceStart, sourceEnd: sourceStart + raw.length, forceTiedTarget, kind: 'placeholder', underlined: false })
    return
  }
  const repeated = /^%\{(\d+)\}$/.exec(raw)
  if (repeated) {
    for (let index = 0; index < Number(repeated[1]); index += 1) {
      items.push({ text: '%', sourceStart, sourceEnd: sourceStart + raw.length, forceTiedTarget: forceTiedTarget && index === 0, kind: 'placeholder', underlined: false })
    }
    return
  }
  if (/^_\{[^}]*\}$/.test(raw) || raw === '_') {
    items.push({ text: '', sourceStart, sourceEnd: sourceStart + raw.length, forceTiedTarget, kind: 'extender', underlined: true })
    return
  }
  const grouped = /^\((.+)\)$/s.exec(raw)
  if (grouped) {
    addItem(items, grouped[1]!, sourceStart, sourceStart + raw.length, forceTiedTarget, true)
    return
  }
  if (mode === 'word') {
    let offset = 0
    const syllables = raw.split('-').filter(Boolean)
    let syllableIndex = 0
    for (const syllable of raw.split('-')) {
      const start = sourceStart + offset
      offset += syllable.length + 1
      if (!syllable) continue
      if (punctuation.test(syllable)) addPunctuation(items, syllable)
      else {
        const wordpos = syllables.length > 1
          ? syllableIndex === 0 ? 'i' : syllableIndex === syllables.length - 1 ? 't' : 'm'
          : undefined
        addItem(items, syllable, start, start + syllable.length, forceTiedTarget && syllableIndex === 0, false, wordpos)
        syllableIndex += 1
      }
    }
    return
  }
  let offset = 0
  let characterIndex = 0
  for (const character of Array.from(raw)) {
    const start = sourceStart + offset
    offset += character.length
    if (punctuation.test(character)) addPunctuation(items, character)
    else {
      addItem(items, character, start, start + character.length, forceTiedTarget && characterIndex === 0)
      characterIndex += 1
    }
  }
}

export function parseLyricItems(source: string, sourceStart: number, mode: LyricMode): ParsedLyricItem[] {
  const items: ParsedLyricItem[] = []
  if (mode === 'word') {
    let index = 0
    while (index < source.length) {
      if (/\s/.test(source[index]!)) {
        index += 1
        continue
      }
      if (source.startsWith('//', index)) {
        const newline = source.indexOf('\n', index)
        index = newline === -1 ? source.length : newline + 1
        continue
      }
      const start = index
      while (index < source.length && !/\s/.test(source[index]!)) index += 1
      const raw = source.slice(start, index)
      const forced = raw.startsWith('+')
      parseUnit(items, forced ? raw.slice(1) : raw, sourceStart + start + (forced ? 1 : 0), forced, mode)
    }
    return items
  }

  let index = 0
  let forceNext = false
  while (index < source.length) {
    const character = source[index]!
    if (/\s/.test(character)) {
      index += 1
      continue
    }
    if (source.startsWith('//', index)) {
      const newline = source.indexOf('\n', index)
      index = newline === -1 ? source.length : newline + 1
      continue
    }
    if (character === '+') {
      forceNext = true
      index += 1
      continue
    }
    const rest = source.slice(index)
    const repeated = /^%\{\d+\}/.exec(rest)?.[0]
    const extender = /^_\{[^}]*\}/.exec(rest)?.[0]
    const grouped = /^\([^)]*\)/.exec(rest)?.[0]
    const raw = repeated ?? extender ?? grouped ?? character
    parseUnit(items, raw, sourceStart + index, forceNext, mode)
    forceNext = false
    index += raw.length
  }
  return items
}

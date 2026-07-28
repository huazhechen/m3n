export type ScoreState = {
  key: string
  beats: number
  beatValue: number
  tempo?: string
}

type BaseEvent = {
  id: string
  source: string
}

export type NoteEvent = BaseEvent & {
  kind: 'note'
  depth: number
  value: string
  carets: number
  dots: number
  tied: boolean
  state: ScoreState
}

export type GroupEvent = BaseEvent & {
  kind: 'group'
  depth: number
  notes: string[]
  mode: 'c' | 'tuplet'
  value: string
  state: ScoreState
}

export type AttributeEvent = BaseEvent & {
  kind: 'attribute'
  attributeType:
    | 'meta'
    | 'state'
    | 'range'
    | 'close'
    | 'postfix'
    | 'dynamic'
    | 'structure'
    | 'custom'
  content: string
}

export type BarlineEvent = BaseEvent & {
  kind: 'barline'
  barline: 'single' | 'double-end' | 'repeat-start' | 'repeat-end' | 'repeat-both'
}

export type UnknownEvent = BaseEvent & {
  kind: 'unknown'
}

export type M3NEvent = NoteEvent | GroupEvent | AttributeEvent | BarlineEvent | UnknownEvent

export type M3NLine = {
  id: string
  source: string
  events: M3NEvent[]
}

export type M3NDocument = {
  lines: M3NLine[]
  diagnostics: Array<{ id: string; message: string }>
  meta: {
    title?: string
    subtitle?: string
    key?: string
    time?: string
  }
  state: ScoreState
  summary: {
    noteCount: number
    groupCount: number
  }
}

const dynamicFlags = new Set(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'fp', 'sfz'])
const rangeFlags = new Set(['lg', 'cresc', 'decres', '8va', '8vb'])
const structureFlags = new Set(['segno', 'fine', 'DC', 'DS'])

function stripComment(line: string) {
  const index = line.indexOf('//')
  return index === -1 ? line : line.slice(0, index)
}

function cloneState(state: ScoreState): ScoreState {
  return { ...state }
}

function classifyAttribute(content: string): AttributeEvent['attributeType'] {
  if (content.startsWith('/')) {
    return 'close'
  }
  if (content.startsWith('+') || content.startsWith('-')) {
    return 'postfix'
  }
  if (/^title=/.test(content) || /^subtitle=/.test(content) || /^meta=/.test(content)) {
    return 'meta'
  }
  if (/^1=/.test(content) || /^\d+\/\d+$/.test(content) || /^tempo=/.test(content)) {
    return 'state'
  }
  if (/^volta=/.test(content) || rangeFlags.has(content)) {
    return 'range'
  }
  if (dynamicFlags.has(content)) {
    return 'dynamic'
  }
  if (/^segno(?:=.+)?$/.test(content) || structureFlags.has(content)) {
    return 'structure'
  }
  return 'custom'
}

function createAttribute(id: string, source: string, content: string): AttributeEvent {
  return {
    id,
    kind: 'attribute',
    source,
    content,
    attributeType: classifyAttribute(content),
  }
}

function createBarline(id: string, source: string): BarlineEvent {
  const map: Record<string, BarlineEvent['barline']> = {
    '|': 'single',
    '|||': 'double-end',
    '||:': 'repeat-start',
    ':||': 'repeat-end',
    ':||:': 'repeat-both',
  }

  return {
    id,
    kind: 'barline',
    source,
    barline: map[source],
  }
}

function parseGroup(
  id: string,
  source: string,
  depth: number,
  state: ScoreState,
): GroupEvent | UnknownEvent {
  const match = /^\[([^\]:]+):([^\]]+)\]$/.exec(source)
  if (!match) {
    return { id, kind: 'unknown', source }
  }

  const notes = match[1].trim().split(/\s+/).filter(Boolean)
  const modeValue = match[2].trim()

  return {
    id,
    kind: 'group',
    source,
    notes,
    mode: modeValue === 'c' ? 'c' : 'tuplet',
    value: modeValue,
    depth,
    state,
  }
}

function createNote(id: string, source: string, depth: number, state: ScoreState): NoteEvent {
  const caretsMatch = source.match(/\^+/)?.[0] ?? ''
  const dotsMatch = source.match(/\.+/g)?.[0] ?? ''
  const base = source.replace(/[\^.~]/g, '')

  return {
    id,
    kind: 'note',
    source,
    depth,
    state,
    value: base,
    carets: caretsMatch.length,
    dots: dotsMatch.length,
    tied: source.endsWith('~'),
  }
}

function applyStateAttribute(state: ScoreState, meta: M3NDocument['meta'], content: string) {
  if (/^1=/.test(content)) {
    const key = content.slice(2)
    if (!meta.key) {
      meta.key = key
    }
    state.key = key
    return
  }

  if (/^\d+\/\d+$/.test(content)) {
    const [beats, beatValue] = content.split('/').map(Number)
    if (!meta.time) {
      meta.time = content
    }
    state.beats = beats
    state.beatValue = beatValue
    return
  }

  if (/^tempo=/.test(content)) {
    state.tempo = content.slice('tempo='.length)
  }
}

function applyMetaAttribute(meta: M3NDocument['meta'], content: string) {
  if (content.startsWith('title=')) {
    meta.title = content.slice('title='.length)
  } else if (content.startsWith('subtitle=')) {
    meta.subtitle = content.slice('subtitle='.length)
  }
}

export function parseM3N(source: string): M3NDocument {
  const diagnostics: M3NDocument['diagnostics'] = []
  const meta: M3NDocument['meta'] = {}
  const state: ScoreState = { key: 'C', beats: 4, beatValue: 4 }
  const lines: M3NLine[] = []
  let noteCount = 0
  let groupCount = 0

  source.split(/\r?\n/).forEach((rawLine, lineIndex) => {
    const lineSource = stripComment(rawLine)
    const events: M3NEvent[] = []
    let cursor = 0
    let depth = 0
    let eventIndex = 0

    while (cursor < lineSource.length) {
      const rest = lineSource.slice(cursor)
      const whitespace = /^\s+/.exec(rest)
      if (whitespace) {
        cursor += whitespace[0].length
        continue
      }

      const barline = /^(?::\|\|:|\|\|\||\|\|:|:\|\||\|)/.exec(rest)
      if (barline) {
        events.push(createBarline(`l${lineIndex}-e${eventIndex += 1}`, barline[0]))
        cursor += barline[0].length
        continue
      }

      if (rest.startsWith('(')) {
        depth += 1
        cursor += 1
        continue
      }

      if (rest.startsWith(')')) {
        depth -= 1
        if (depth < 0) {
          diagnostics.push({
            id: `d-${lineIndex}-${cursor}`,
            message: `第 ${lineIndex + 1} 行存在多余的右括号。`,
          })
          depth = 0
        }
        cursor += 1
        continue
      }

      const attribute = /^\{[^}]+\}/.exec(rest)
      if (attribute) {
        const content = attribute[0].slice(1, -1).trim()
        const item = createAttribute(`l${lineIndex}-e${eventIndex += 1}`, attribute[0], content)
        events.push(item)
        if (item.attributeType === 'state') {
          applyStateAttribute(state, meta, content)
        }
        if (item.attributeType === 'meta') {
          applyMetaAttribute(meta, content)
        }
        cursor += attribute[0].length
        continue
      }

      const group = /^\[[^[\]]+\]/.exec(rest)
      if (group) {
        const item = parseGroup(
          `l${lineIndex}-e${eventIndex += 1}`,
          group[0],
          depth,
          cloneState(state),
        )
        if (item.kind === 'group') {
          groupCount += 1
        }
        events.push(item)
        cursor += group[0].length
        continue
      }

      const note = /^(?:[1-7](?:[#b=]+)?(?:[ed]+)?|0|X)(?:\^+)?(?:\.+)?~?/.exec(rest)
      if (note) {
        const item = createNote(
          `l${lineIndex}-e${eventIndex += 1}`,
          note[0],
          depth,
          cloneState(state),
        )
        noteCount += 1
        events.push(item)
        cursor += note[0].length
        continue
      }

      const fallback = /^\S+/.exec(rest)?.[0] ?? rest[0]
      events.push({
        id: `l${lineIndex}-e${eventIndex += 1}`,
        kind: 'unknown',
        source: fallback,
      })
      diagnostics.push({
        id: `d-${lineIndex}-${cursor}`,
        message: `第 ${lineIndex + 1} 行存在无法识别的片段：${fallback}`,
      })
      cursor += fallback.length
    }

    if (depth !== 0) {
      diagnostics.push({
        id: `d-depth-${lineIndex}`,
        message: `第 ${lineIndex + 1} 行的括号没有闭合。`,
      })
    }

    lines.push({
      id: `line-${lineIndex}`,
      source: rawLine,
      events,
    })
  })

  return {
    lines,
    diagnostics,
    meta,
    state,
    summary: {
      noteCount,
      groupCount,
    },
  }
}

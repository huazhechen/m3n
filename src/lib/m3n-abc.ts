export type NotationMode = 'm3n' | 'abc'

export type ConversionResult = {
  source: string
  output: string
  diagnostics: string[]
  sourceMap?: SourceMapRange[]
}

export type SourceMapRange = {
  outputStart: number
  outputEnd: number
  sourceStart: number
  sourceEnd: number
}

type Meter = {
  beats: number
  beatValue: number
}

type HeaderState = {
  title: string
  subtitle: string
  composer: string
  lyricist: string
  key: string
  meter: Meter
  tempo: string
  parts: string
}

type BodyConversionResult = {
  body: string
  mappings: SourceMapRange[]
}

const defaultHeader: HeaderState = {
  title: 'Untitled',
  subtitle: '',
  composer: '',
  lyricist: '',
  key: 'C',
  meter: { beats: 4, beatValue: 4 },
  tempo: '',
  parts: '',
}

const pitchLetters = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const abcKeyAliases: Record<string, string> = {
  maj: '',
  min: 'm',
  dor: 'Dor',
  phr: 'Phr',
  lyd: 'Lyd',
  mix: 'Mix',
  loc: 'Loc',
}

function parseKey(rawKey: string) {
  const match = /^([A-G](?:#|b)?)(\d+)?([A-Za-z]*)$/.exec(rawKey.trim())
  if (!match) {
    return { tonic: 'C', mode: '' }
  }

  return {
    tonic: match[1],
    mode: match[3] || '',
  }
}

function keyToAbc(rawKey: string) {
  const { tonic, mode } = parseKey(rawKey)
  return `${tonic}${abcKeyAliases[mode] ?? mode}`
}

function degreeToLetter(degree: number, key: string) {
  const { tonic } = parseKey(key)
  const tonicLetter = tonic[0]?.toUpperCase() ?? 'C'
  const tonicIndex = pitchLetters.indexOf(tonicLetter)
  const index = tonicIndex === -1 ? 0 : tonicIndex
  return pitchLetters[(index + degree - 1) % pitchLetters.length]
}

function implicitOctaveShift(degree: number, key: string) {
  const { tonic } = parseKey(key)
  const tonicLetter = tonic[0]?.toUpperCase() ?? 'C'
  const tonicIndex = pitchLetters.indexOf(tonicLetter)
  const normalizedTonicIndex = tonicIndex === -1 ? 0 : tonicIndex
  const letterIndex = pitchLetters.indexOf(degreeToLetter(degree, key))
  return letterIndex < normalizedTonicIndex ? 1 : 0
}

function letterToDegree(letter: string, key: string) {
  const { tonic } = parseKey(key)
  const tonicLetter = tonic[0]?.toUpperCase() ?? 'C'
  const tonicIndex = pitchLetters.indexOf(tonicLetter)
  const letterIndex = pitchLetters.indexOf(letter.toUpperCase())
  const normalizedTonicIndex = tonicIndex === -1 ? 0 : tonicIndex
  const normalizedLetterIndex = letterIndex === -1 ? normalizedTonicIndex : letterIndex
  return ((normalizedLetterIndex - normalizedTonicIndex + pitchLetters.length) % pitchLetters.length) + 1
}

function accidentalPrefix(value: string) {
  if (!value) {
    return ''
  }

  if (value.includes('=')) {
    return '='
  }

  return value
    .split('')
    .map((char) => (char === '#' ? '^' : char === 'b' ? '_' : ''))
    .join('')
}

function applyOctave(note: string, octave: string, baseShift = 0) {
  let shift = baseShift
  for (const char of octave) {
    if (char === 'e') {
      shift += 1
    }
    if (char === 'd') {
      shift -= 1
    }
  }

  if (shift > 0) {
    return `${note.toLowerCase()}${"'".repeat(Math.max(0, shift - 1))}`
  }

  if (shift < 0) {
    return `${note.toUpperCase()}${','.repeat(Math.abs(shift))}`
  }

  return note.toUpperCase()
}

function durationSuffix(depth: number, carets: number, dots: number) {
  let numerator = 1
  let denominator = 2 ** depth
  numerator *= 2 ** carets

  if (dots > 0) {
    let dotNumerator = numerator
    let dotDenominator = denominator
    for (let index = 0; index < dots; index += 1) {
      dotDenominator *= 2
      numerator = numerator * dotDenominator + dotNumerator * denominator
      denominator *= dotDenominator
      const divisor = greatestCommonDivisor(numerator, denominator)
      numerator /= divisor
      denominator /= divisor
    }
  }

  if (denominator === 1 && numerator === 1) {
    return ''
  }

  if (denominator === 1) {
    return String(numerator)
  }

  if (numerator === 1 && denominator === 2) {
    return '/'
  }

  return `${numerator}/${denominator}`
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b)
}

function durationInBeats(depth: number, carets: number, dots: number) {
  let duration = 2 ** (carets - depth)
  let dotDuration = duration / 2

  for (let index = 0; index < dots; index += 1) {
    duration += dotDuration
    dotDuration /= 2
  }

  return duration
}

function parseM3NNote(token: string) {
  const match = /^(0|[1-7])([#b=]*)([ed]*)(\^*)(\.*)(~?)$/.exec(token)
  if (!match) {
    return null
  }

  const [, degreeRaw, accidentals, octave, carets, dots, tie] = match
  return { degreeRaw, accidentals, octave, carets, dots, tie }
}

function convertM3NNote(token: string, depth: number, key: string) {
  const parsed = parseM3NNote(token)
  if (!parsed) {
    return token
  }

  const { degreeRaw, accidentals, octave, carets, dots, tie } = parsed
  const duration = durationSuffix(depth, carets.length, dots.length)

  if (degreeRaw === '0') {
    return `z${duration}`
  }

  const degree = Number(degreeRaw)
  const noteName = degreeToLetter(degree, key)
  const abcNote = `${accidentalPrefix(accidentals)}${applyOctave(noteName, octave, implicitOctaveShift(degree, key))}${duration}`
  return tie ? `${abcNote}-` : abcNote
}

function convertM3NNotePitch(token: string, key: string) {
  const parsed = parseM3NNote(token)
  if (!parsed) {
    return token
  }

  const { degreeRaw, accidentals, octave, tie } = parsed
  if (degreeRaw === '0') {
    return 'z'
  }

  const degree = Number(degreeRaw)
  const noteName = degreeToLetter(degree, key)
  const abcNote = `${accidentalPrefix(accidentals)}${applyOctave(noteName, octave, implicitOctaveShift(degree, key))}`
  return tie ? `${abcNote}-` : abcNote
}

function harmonyDuration(notes: string[], depth: number, carets = 0, dots = 0) {
  const parsedNotes = notes.map(parseM3NNote)
  const first = parsedNotes[0]
  if (!first || parsedNotes.some((note) => !note)) {
    return null
  }

  const sameDuration = parsedNotes.every(
    (note) => note?.carets.length === first.carets.length && note.dots.length === first.dots.length,
  )

  if (!sameDuration) {
    return null
  }

  return durationSuffix(depth, first.carets.length + carets, first.dots.length + dots)
}

function convertGroup(token: string, depth: number, key: string) {
  const match = /^\[([^\]:]+):([^\]]+)\](\^*)(\.*)(~?)$/.exec(token)
  if (!match) {
    return token
  }

  const notes = match[1].trim().split(/\s+/).filter(Boolean)
  const mode = match[2].trim()
  const groupCarets = match[3].length
  const groupDots = match[4].length
  const groupTie = match[5]

  if (mode === 'h') {
    const duration = harmonyDuration(notes, depth, groupCarets, groupDots)
    if (duration !== null) {
      return `[${notes.map((note) => convertM3NNotePitch(note, key)).join('')}]${duration}${groupTie ? '-' : ''}`
    }

    return `[${notes.map((note) => convertM3NNote(note, depth, key)).join('')}]`
  }

  const totalUnits = Number(mode)
  const tupletPrefix = Number.isFinite(totalUnits)
    ? `(${notes.length}:${totalUnits}:${notes.length}`
    : `(${notes.length}`

  return `${tupletPrefix}${notes.map((note) => convertM3NNote(note, depth, key)).join('')}`
}

function groupDurationInBeats(token: string, depth: number) {
  const match = /^\[([^\]:]+):([^\]]+)\](\^*)(\.*)~?$/.exec(token)
  if (!match) {
    return 0
  }

  const notes = match[1].trim().split(/\s+/).filter(Boolean)
  const mode = match[2].trim()
  const carets = match[3].length
  const dots = match[4].length

  if (mode === 'h') {
    const first = parseM3NNote(notes[0] ?? '')
    return first ? durationInBeats(depth, first.carets.length + carets, first.dots.length + dots) : 0
  }

  const units = Number(mode)
  return Number.isFinite(units) ? units * durationInBeats(depth, carets, dots) : 0
}

function beamSpanInBeats(meter: Meter) {
  return meter.beatValue === 8 && meter.beats % 3 === 0 ? 3 : 1
}

type IntervalAttribute = 'cresc' | 'decres' | '8va' | '8vb'

function isIntervalAttribute(value: string): value is IntervalAttribute {
  return value === 'cresc' || value === 'decres' || value === '8va' || value === '8vb'
}

function intervalEndDecoration(value: string) {
  if (value === 'cresc') {
    return '!crescendo)!'
  }
  if (value === 'decres') {
    return '!diminuendo)!'
  }
  if (value === '8va') {
    return '!8va)!'
  }
  if (value === '8vb') {
    return '!8vb)!'
  }
  return ''
}

function isPostfixAttribute(value: string) {
  return /^(tr|echo|wav[+-]?|str|tip|brk|hold|breath|f[1-5])$/.test(value)
}

function convertAttribute(content: string, header: HeaderState) {
  if (content.startsWith('title=')) {
    header.title = content.slice('title='.length)
    return ''
  }
  if (content.startsWith('subtitle=')) {
    header.subtitle = content.slice('subtitle='.length)
    return ''
  }
  if (content.startsWith('composer=')) {
    header.composer = content.slice('composer='.length)
    return ''
  }
  if (content.startsWith('lyricist=')) {
    header.lyricist = content.slice('lyricist='.length)
    return ''
  }
  if (content.startsWith('key=')) {
    header.key = content.slice('key='.length)
    return ''
  }
  if (content.startsWith('1=')) {
    header.key = content.slice('1='.length)
    return ''
  }
  if (/^\d+\/\d+$/.test(content)) {
    const [beats, beatValue] = content.split('/').map(Number)
    header.meter = { beats, beatValue }
    return ''
  }
  if (content.startsWith('tempo=')) {
    header.tempo = content.slice('tempo='.length).replace(/bpm$/i, '')
    return ''
  }
  if (content.startsWith('parts=')) {
    header.parts = content.slice('parts='.length)
    return ''
  }
  if (content.startsWith('part=')) {
    return `P:${content.slice('part='.length)}`
  }
  if (content.startsWith('rest=')) {
    return `Z${content.slice('rest='.length)}`
  }
  if (content.startsWith('chord=')) {
    return `"${content.slice('chord='.length)}"`
  }
  if (content.startsWith('text=')) {
    return `"^${content.slice('text='.length).replace(/^"|"$/g, '')}"`
  }
  if (content === 'br') {
    return '\n'
  }
  if (content === 'tr') {
    return '!trill!'
  }
  if (content === 'echo') {
    return '!turn!'
  }
  if (content === 'wav' || content === 'wav+') {
    return '!uppermordent!'
  }
  if (content === 'wav-') {
    return '!lowermordent!'
  }
  if (content === 'str') {
    return '!accent!'
  }
  if (content === 'tip' || content === 'brk') {
    return '!staccato!'
  }
  if (content === 'hold') {
    return '!tenuto!'
  }
  if (content === 'breath') {
    return '!breath!'
  }
  if (/^f[1-5]$/.test(content)) {
    return `!${content.slice(1)}!`
  }
  if (/^(ppp|pp|p|mp|mf|f|ff|fff|fp|sfz)$/.test(content)) {
    return `!${content}!`
  }
  if (content === 'cresc') {
    return '!crescendo(!'
  }
  if (content === 'decres') {
    return '!diminuendo(!'
  }
  if (content === '8va') {
    return '!8va(!'
  }
  if (content === '8vb') {
    return '!8vb(!'
  }
  if (content.startsWith('/')) {
    return intervalEndDecoration(content.slice(1))
  }
  if (content.startsWith('volta=')) {
    return `[${content.slice('volta='.length)}`
  }
  if (content === 'segno') {
    return '!segno!'
  }
  if (content === 'fine') {
    return '!fine!'
  }
  if (content === 'DC') {
    return '!D.C.!'
  }
  if (content === 'DS') {
    return '!D.S.!'
  }

  return ''
}

function splitSupplementBlocks(source: string) {
  const lyrics: Array<{ range: string; text: string }> = []
  let bass = ''
  let main = source

  main = main.replace(/\{lyrics(?:=([^}]+))?\}([\s\S]*?)\{\/\}/g, (_match, range, text) => {
    lyrics.push({ range: range ?? '', text: String(text).trim() })
    return ''
  })

  main = main.replace(/\{bass\}([\s\S]*?)\{\/\}/g, (_match, text) => {
    bass = String(text).trim()
    return ''
  })

  return { main, bass, lyrics }
}

export function m3nToAbc(source: string): ConversionResult {
  const diagnostics: string[] = []
  const header: HeaderState = structuredClone(defaultHeader)
  const { main, bass, lyrics } = splitSupplementBlocks(source)
  const bodyResult = convertM3NBody(main, header, diagnostics)
  const bassResult = bass ? convertM3NBody(bass, header, diagnostics) : null
  const body = bodyResult.body.trim()
  const bassBody = bassResult?.body.trim() ?? ''
  const lines = [
    'X:1',
    `T:${header.title}`,
    header.subtitle ? `T:${header.subtitle}` : '',
    header.composer ? `C:${header.composer}` : '',
    header.parts ? `N:M3N parts=${header.parts}` : '',
    `M:${header.meter.beats}/${header.meter.beatValue}`,
    `L:1/${header.meter.beatValue}`,
    header.tempo ? `Q:1/${header.meter.beatValue}=${header.tempo}` : '',
    `K:${keyToAbc(header.key)}`,
    bassBody ? 'V:melody clef=treble name="Melody"' : '',
    body.trim(),
    bassBody ? 'V:bass clef=bass name="Bass"' : '',
    bassBody,
    ...lyrics.map((item) => `W:${item.range ? `[${item.range}] ` : ''}${item.text.replace(/\s+/g, ' ')}`),
  ].filter(Boolean)
  const output = lines.join('\n')
  const bodyStart = output.indexOf(body)
  const sourceMap =
    bodyStart >= 0
      ? bodyResult.mappings.map((range) => ({
          ...range,
          outputStart: bodyStart + range.outputStart,
          outputEnd: bodyStart + range.outputEnd,
        }))
      : []

  return {
    source,
    output,
    diagnostics,
    sourceMap,
  }
}

function convertM3NBody(
  source: string,
  header: HeaderState,
  diagnostics: string[],
): BodyConversionResult {
  const output: string[] = []
  const mappings: SourceMapRange[] = []
  let depth = 0
  let index = 0
  let line = 1
  let beatPosition = 0
  let groupBoundary = false
  const intervalAttributes: IntervalAttribute[] = []
  let lastNotationOutputIndex: number | null = null

  const outputLength = () => output.join('').length

  const pushMapped = (value: string, sourceStart: number, sourceEnd: number) => {
    const outputStart = outputLength()
    output.push(value)
    lastNotationOutputIndex = output.length - 1
    mappings.push({
      outputStart,
      outputEnd: outputStart + value.length,
      sourceStart,
      sourceEnd,
    })
  }

  const advanceBeatPosition = (duration: number) => {
    const span = beamSpanInBeats(header.meter)
    beatPosition = (beatPosition + duration) % span
    if (beatPosition < Number.EPSILON || span - beatPosition < Number.EPSILON) {
      beatPosition = 0
    }
  }

  while (index < source.length) {
    const rest = source.slice(index)
    const whitespace = /^\s+/.exec(rest)
    if (whitespace) {
      const shouldBreakBeam =
        groupBoundary ||
        depth === 0 &&
          (beatPosition === 0 || beamSpanInBeats(header.meter) - beatPosition < Number.EPSILON)
      if (whitespace[0].includes('\n') || shouldBreakBeam) {
        output.push(whitespace[0].includes('\n') ? '\n' : ' ')
      }
      groupBoundary = false
      line += whitespace[0].split('\n').length - 1
      index += whitespace[0].length
      continue
    }

    if (rest.startsWith('//')) {
      const end = rest.indexOf('\n')
      index += end === -1 ? rest.length : end
      continue
    }

    const bar = /^(?::\|\|\||:\|\|:|:\|\||\|\|\||\|\|:|\|)/.exec(rest)
    if (bar) {
      const map: Record<string, string> = {
        '|': '|',
        '|||': '|]',
        '||:': '|:',
        ':||': ':|',
        ':|||': ':|]',
        ':||:': ':| |:',
      }
      output.push(` ${map[bar[0]]} `)
      beatPosition = 0
      groupBoundary = false
      index += bar[0].length
      continue
    }

    if (rest.startsWith('(')) {
      depth += 1
      groupBoundary = false
      index += 1
      continue
    }

    if (rest.startsWith(')')) {
      depth = Math.max(0, depth - 1)
      groupBoundary = depth === 0
      index += 1
      continue
    }

    const attribute = /^\{[^}]+\}/.exec(rest)
    if (attribute) {
      const content = attribute[0].slice(1, -1).trim()
      let value = ''
      if (content === '/') {
        value = intervalEndDecoration(intervalAttributes.pop() ?? '')
      } else {
        value = convertAttribute(content, header)
        if (isIntervalAttribute(content)) {
          intervalAttributes.push(content)
        } else if (content.startsWith('/')) {
          const closing = content.slice(1)
          const matchingIndex = intervalAttributes.lastIndexOf(closing as IntervalAttribute)
          if (matchingIndex !== -1) {
            intervalAttributes.splice(matchingIndex, 1)
          }
        }
      }
      if (value) {
        if (isPostfixAttribute(content) && lastNotationOutputIndex !== null) {
          output[lastNotationOutputIndex] = `${value}${output[lastNotationOutputIndex]}`
          const lastMapping = mappings.at(-1)
          if (lastMapping) {
            lastMapping.outputStart += value.length
            lastMapping.outputEnd += value.length
          }
        } else {
          output.push(value)
        }
      }
      index += attribute[0].length
      continue
    }

    const group = /^\[[^[\]]+\](?:\^+)?(?:\.*)?~?/.exec(rest)
    if (group) {
      pushMapped(convertGroup(group[0], depth, header.key), index, index + group[0].length)
      advanceBeatPosition(groupDurationInBeats(group[0], depth))
      groupBoundary = false
      index += group[0].length
      continue
    }

    const note = /^(?:0|[1-7][#b=]*[ed]*)(?:\^+)?(?:\.*)?~?/.exec(rest)
    if (note) {
      pushMapped(convertM3NNote(note[0], depth, header.key), index, index + note[0].length)
      const parsed = parseM3NNote(note[0])
      if (parsed) {
        advanceBeatPosition(durationInBeats(depth, parsed.carets.length, parsed.dots.length))
      }
      groupBoundary = false
      index += note[0].length
      continue
    }

    const unknown = /^\S+/.exec(rest)?.[0] ?? rest[0]
    diagnostics.push(`第 ${line} 行：无法转换片段：${unknown}`)
    output.push(`% ${unknown}`)
    index += unknown.length
  }

  const rawBody = output.join('')
  const trimStart = rawBody.length - rawBody.trimStart().length
  const body = rawBody.trim()
  return {
    body,
    mappings: mappings.map((range) => ({
      ...range,
      outputStart: Math.max(0, range.outputStart - trimStart),
      outputEnd: Math.max(0, range.outputEnd - trimStart),
    })),
  }
}

function parseAbcHeader(source: string) {
  const header = structuredClone(defaultHeader)
  const body: string[] = []
  const lyrics: string[] = []

  source.split(/\r?\n/).forEach((line) => {
    if (/^T:/.test(line)) {
      const titleLine = line.slice(2).trim()
      if (header.title === defaultHeader.title) {
        header.title = titleLine
      } else {
        header.subtitle = header.subtitle ? `${header.subtitle} ${titleLine}` : titleLine
      }
      return
    }
    if (/^C:/.test(line)) {
      header.composer = line.slice(2).trim()
      return
    }
    if (/^N:M3N parts=/.test(line)) {
      header.parts = line.slice('N:M3N parts='.length).trim()
      return
    }
    if (/^M:/.test(line)) {
      const [beats, beatValue] = line.slice(2).split('/').map(Number)
      if (beats && beatValue) {
        header.meter = { beats, beatValue }
      }
      return
    }
    if (/^Q:/.test(line)) {
      header.tempo = line.split('=').at(-1)?.trim() ?? header.tempo
      return
    }
    if (/^K:/.test(line)) {
      header.key = line.slice(2).trim()
      return
    }
    if (/^P:/.test(line)) {
      body.push(line)
      return
    }
    if (/^V:/.test(line)) {
      body.push(line)
      return
    }
    if (/^W:/.test(line)) {
      lyrics.push(line.slice(2).trim())
      return
    }
    if (/^[A-Za-z]:/.test(line)) {
      return
    }
    body.push(line)
  })

  return { header, body: body.join('\n'), lyrics }
}

function abcNoteToM3N(token: string, key: string) {
  const hasTie = token.endsWith('-')
  const normalizedToken = hasTie ? token.slice(0, -1) : token

  if (/^Z/.test(normalizedToken)) {
    return `{rest=${normalizedToken.slice(1) || '1'}}`
  }

  if (/^z/.test(normalizedToken)) {
    return applyAbcDurationToM3N('0', normalizedToken.slice(1))
  }

  const match = /^([_=^]*)([A-Ga-g])([,']*)(.*)$/.exec(normalizedToken)
  if (!match) {
    return token
  }

  const [, accidentalRaw, letterRaw, octaveRaw, durationRaw] = match
  const letter = letterRaw.toUpperCase()
  const degree = letterToDegree(letter, key)
  const accidental = accidentalRaw.replace(/\^/g, '#').replace(/_/g, 'b')
  const abcOctave =
    (letterRaw === letterRaw.toLowerCase() ? 1 : 0) +
    (octaveRaw.match(/'/g)?.length ?? 0) -
    (octaveRaw.match(/,/g)?.length ?? 0)
  const explicitOctave = abcOctave - implicitOctaveShift(degree, key)
  const octave =
    explicitOctave > 0 ? 'e'.repeat(explicitOctave) : explicitOctave < 0 ? 'd'.repeat(-explicitOctave) : ''

  const base = `${degree}${accidental}${octave}`
  return applyAbcDurationToM3N(base, durationRaw, hasTie)
}

const abcDecorationToM3N: Record<string, string> = {
  ppp: '{ppp}',
  pp: '{pp}',
  p: '{p}',
  mp: '{mp}',
  mf: '{mf}',
  f: '{f}',
  ff: '{ff}',
  fff: '{fff}',
  fp: '{fp}',
  sfz: '{sfz}',
  trill: '{tr}',
  uppermordent: '{wav}',
  lowermordent: '{wav-}',
  accent: '{str}',
  staccato: '{tip}',
  tenuto: '{hold}',
  breath: '{breath}',
  'crescendo(': '{cresc}',
  'diminuendo(': '{decres}',
  '8va(': '{8va}',
  '8vb(': '{8vb}',
}

function convertAbcDecorations(value: string) {
  return value
    .replace(/!([A-Za-z0-9.()]+)!/g, (_match, name) => abcDecorationToM3N[name] ?? '')
    .replace(/"([^"]+)"/g, (_match, label) =>
      String(label).startsWith('^') ? `{text=${String(label).slice(1)}}` : `{chord=${label}}`,
    )
}

function applyAbcDurationToHarmonyGroup(notes: string[], value: string, hasTie = false) {
  const tie = hasTie ? '~' : ''

  if (!value || value === '1') {
    return `[${notes.join(' ')}:h]${tie}`
  }

  if (value === '2') {
    return `[${notes.join(' ')}:h]^${tie}`
  }
  if (value === '4') {
    return `[${notes.join(' ')}:h]^^${tie}`
  }
  if (value === '3') {
    return `[${notes.join(' ')}:h]^.${tie}`
  }
  if (value === '/' || value === '/2') {
    return `([${notes.join(' ')}:h]${tie})`
  }
  if (value === '/4' || value === '1/4') {
    return `(([${notes.join(' ')}:h]${tie}))`
  }
  if (value === '3/2') {
    return `[${notes.join(' ')}:h].${tie}`
  }

  return `[${notes.join(' ')}:h]${tie}`
}

function abcNoteWithoutDuration(token: string) {
  return token.replace(/^([_=^]*[A-Ga-g][,']*)[0-9/]*(-?)$/, '$1$2')
}

function convertAbcNotesWithoutTouchingAttributes(value: string, key: string) {
  const attributes: string[] = []
  const protectedValue = value.replace(/\{[^}]+\}/g, (match) => {
    const marker = `§${attributes.length}§`
    attributes.push(match)
    return marker
  })
  const groups: string[] = []

  return protectedValue
    .replace(/\((\d+):(\d+):\d+((?:[_=^]*[A-Ga-g][,']*[0-9/]*-?)+)/g, (_match, _count, units, notesRaw) => {
      const notes = String(notesRaw).match(/[_=^]*[A-Ga-g][,']*[0-9/]*-?/g) ?? []
      const value = `[${notes.map((note) => abcNoteToM3N(note, key).replace(/[().]/g, '')).join(' ')}:${units}]`
      const marker = `¤${groups.length}¤`
      groups.push(value)
      return marker
    })
    .replace(/\[([A-Ga-g,_'=^0-9/-]+)\]([0-9/]*)(-?)/g, (_match, notesRaw, durationRaw, tieRaw) => {
      const notes = String(notesRaw).match(/[_=^]*[A-Ga-g][,']*[0-9/]*-?/g) ?? []
      const chordDuration = String(durationRaw)
      const chordTie = String(tieRaw)
      const value = chordDuration
        ? applyAbcDurationToHarmonyGroup(
            notes.map((note) => abcNoteToM3N(abcNoteWithoutDuration(note), key)),
            chordDuration,
            Boolean(chordTie),
          )
        : `[${notes.map((note) => abcNoteToM3N(note, key)).join(' ')}:h]`
      const marker = `¤${groups.length}¤`
      groups.push(value)
      return marker
    })
    .replace(/(?:Z[0-9]+|[_=^]*[A-Ga-gz][,']*[0-9/]*-?)/g, (token) => abcNoteToM3N(token, key))
    .replace(/¤(\d+)¤/g, (_match, index) => groups[Number(index)] ?? '')
    .replace(/§(\d+)§/g, (_match, index) => attributes[Number(index)] ?? '')
}

function applyAbcDurationToM3N(base: string, value: string, hasTie = false) {
  const tie = hasTie ? '~' : ''

  if (!value || value === '1') {
    return `${base}${tie}`
  }

  if (value === '2') {
    return `${base}^${tie}`
  }
  if (value === '4') {
    return `${base}^^${tie}`
  }
  if (value === '3') {
    return `${base}^.${tie}`
  }
  if (value === '/' || value === '/2') {
    return `(${base}${tie})`
  }
  if (value === '/4' || value === '1/4') {
    return `((${base}${tie}))`
  }
  if (value === '3/2') {
    return `${base}.${tie}`
  }

  return `${base}${tie}`
}

export function abcToM3N(source: string): ConversionResult {
  const { header, body, lyrics } = parseAbcHeader(source)
  const output: string[] = [
    header.title ? `{title=${header.title}}` : '',
    header.subtitle ? `{subtitle=${header.subtitle}}` : '',
    header.composer ? `{composer=${header.composer}}` : '',
    header.parts ? `{parts=${header.parts}}` : '',
    `{key=${header.key || 'C'}} {${header.meter.beats}/${header.meter.beatValue}} {tempo=${header.tempo}bpm}`,
  ].filter(Boolean)

  const bodyLines: string[] = []
  const bassLines: string[] = []
  let activeVoice: 'melody' | 'bass' = 'melody'

  body.split(/\r?\n/).forEach((line) => {
    if (/^V:/.test(line)) {
      activeVoice = /bass/i.test(line) ? 'bass' : 'melody'
      return
    }
    if (activeVoice === 'bass') {
      bassLines.push(line)
    } else {
      bodyLines.push(line)
    }
  })

  const convertAbcBody = (value: string) =>
    convertAbcNotesWithoutTouchingAttributes(
      convertAbcDecorations(value)
        .replace(/^P:([^\n]+)/gm, (_match, value) => `{part=${String(value).trim()}}`)
        .replace(/\[(\d+)\s+/g, (_match, value) => `{volta=${value}} `),
      header.key,
    )
    .replace(/\|:/g, '||:')
    .replace(/:\|\]/g, ':|||')
    .replace(/:\|/g, ':||')
    .replace(/\|\]/g, '|||')
    .replace(/\|/g, '|')
    .replace(/:\|{4,}/g, ':|||')

  output.push(convertAbcBody(bodyLines.join('\n')))

  if (bassLines.some((line) => line.trim())) {
    output.push('', '{bass}', convertAbcBody(bassLines.join('\n')), '{/}')
  }

  lyrics.forEach((line) => {
    const range = /^\[([^\]]+)\]\s*(.*)$/.exec(line)
    output.push('', range ? `{lyrics=${range[1]}}` : '{lyrics}', range ? range[2] : line, '{/}')
  })

  return {
    source,
    output: output.join('\n'),
    diagnostics: [],
  }
}

export function convertNotation(source: string, from: NotationMode): ConversionResult {
  return from === 'm3n' ? m3nToAbc(source) : abcToM3N(source)
}

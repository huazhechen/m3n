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
  tempo: '100',
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

function convertM3NNote(token: string, depth: number, key: string) {
  const match = /^(0|[1-7])([#b=]*)([ed]*)(\^*)(\.*)(~?)$/.exec(token)
  if (!match) {
    return token
  }

  const [, degreeRaw, accidentals, octave, carets, dots, tie] = match
  const duration = durationSuffix(depth, carets.length, dots.length)

  if (degreeRaw === '0') {
    return `z${duration}`
  }

  const degree = Number(degreeRaw)
  const noteName = degreeToLetter(degree, key)
  const abcNote = `${accidentalPrefix(accidentals)}${applyOctave(noteName, octave, implicitOctaveShift(degree, key))}${duration}`
  return tie ? `${abcNote}-` : abcNote
}

function convertGroup(token: string, depth: number, key: string) {
  const match = /^\[([^\]:]+):([^\]]+)\]$/.exec(token)
  if (!match) {
    return token
  }

  const notes = match[1].trim().split(/\s+/).filter(Boolean)
  const mode = match[2].trim()

  if (mode === 'h') {
    return `[${notes.map((note) => convertM3NNote(note, 0, key)).join('')}]${durationSuffix(depth, 0, 0)}`
  }

  const totalUnits = Number(mode)
  const tupletPrefix = Number.isFinite(totalUnits)
    ? `(${notes.length}:${totalUnits}:${notes.length}`
    : `(${notes.length}`

  return `${tupletPrefix}${notes.map((note) => convertM3NNote(note, depth, key)).join('')}`
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
  if (/^(ppp|pp|p|mp|mf|f|ff|fff|fp|sfz)$/.test(content)) {
    return `!${content}!`
  }
  if (content === 'cresc') {
    return '!crescendo(!'
  }
  if (content === 'decres') {
    return '!diminuendo(!'
  }
  if (content.startsWith('/')) {
    return content.includes('decres') ? '!diminuendo)!' : content.includes('cresc') ? '!crescendo)!' : ''
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
    `M:${header.meter.beats}/${header.meter.beatValue}`,
    `L:1/${header.meter.beatValue}`,
    `Q:1/${header.meter.beatValue}=${header.tempo || '100'}`,
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

  const outputLength = () => output.join('').length

  const pushMapped = (value: string, sourceStart: number, sourceEnd: number) => {
    const outputStart = outputLength()
    output.push(value)
    mappings.push({
      outputStart,
      outputEnd: outputStart + value.length,
      sourceStart,
      sourceEnd,
    })
  }

  while (index < source.length) {
    const rest = source.slice(index)
    const whitespace = /^\s+/.exec(rest)
    if (whitespace) {
      output.push(whitespace[0].includes('\n') ? '\n' : ' ')
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
      index += bar[0].length
      continue
    }

    if (rest.startsWith('(')) {
      depth += 1
      index += 1
      continue
    }

    if (rest.startsWith(')')) {
      depth = Math.max(0, depth - 1)
      index += 1
      continue
    }

    const attribute = /^\{[^}]+\}/.exec(rest)
    if (attribute) {
      const value = convertAttribute(attribute[0].slice(1, -1).trim(), header)
      if (value) {
        output.push(value)
      }
      index += attribute[0].length
      continue
    }

    const group = /^\[[^[\]]+\]/.exec(rest)
    if (group) {
      pushMapped(convertGroup(group[0], depth, header.key), index, index + group[0].length)
      index += group[0].length
      continue
    }

    const note = /^(?:0|[1-7][#b=]*[ed]*)(?:\^+)?(?:\.*)?~?/.exec(rest)
    if (note) {
      pushMapped(convertM3NNote(note[0], depth, header.key), index, index + note[0].length)
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
    if (/^[A-Za-z]:/.test(line)) {
      return
    }
    body.push(line)
  })

  return { header, body: body.join('\n') }
}

function abcNoteToM3N(token: string, key: string) {
  const hasTie = token.endsWith('-')
  const normalizedToken = hasTie ? token.slice(0, -1) : token

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
  if (value === '/' || value === '/2') {
    return `(${base}${tie})`
  }
  if (value === '3/2') {
    return `${base}.${tie}`
  }

  return `${base}${tie}`
}

export function abcToM3N(source: string): ConversionResult {
  const { header, body } = parseAbcHeader(source)
  const output: string[] = [
    header.title ? `{title=${header.title}}` : '',
    header.subtitle ? `{subtitle=${header.subtitle}}` : '',
    header.composer ? `{composer=${header.composer}}` : '',
    `{key=${header.key || 'C'}} {${header.meter.beats}/${header.meter.beatValue}} {tempo=${header.tempo}bpm}`,
  ].filter(Boolean)

  const convertedBody = body
    .replace(/\|:/g, '||:')
    .replace(/:\|\]/g, ':|||')
    .replace(/:\|/g, ':||')
    .replace(/\|\]/g, '|||')
    .replace(/\|/g, '|')
    .replace(/\[[A-Ga-gz,_'=^0-9/-]+\]/g, (match) => {
      const notes = match.slice(1, -1).match(/[_=^]*[A-Ga-g][,']*[0-9/]*-?/g) ?? []
      return `[${notes.map((note) => abcNoteToM3N(note, header.key)).join(' ')}:h]`
    })
    .replace(/[_=^]*[A-Ga-gz][,']*[0-9/]*-?/g, (token) => abcNoteToM3N(token, header.key))

  output.push(convertedBody)

  return {
    source,
    output: output.join('\n'),
    diagnostics: [],
  }
}

export function convertNotation(source: string, from: NotationMode): ConversionResult {
  return from === 'm3n' ? m3nToAbc(source) : abcToM3N(source)
}

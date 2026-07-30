import { durationInBeats, parseKey, parseM3NNote } from './notation/m3n-primitives'
import { parseM3NGroupPitches } from './notation/m3n-groups'
import { splitSupplementBlocks } from './notation/supplements'
import type { ConversionResult, NotationMode, SourceMapRange } from './notation/types'

export { durationInBeats, parseKey, parseM3NNote } from './notation/m3n-primitives'
export { splitSupplementBlocks } from './notation/supplements'
export type { ConversionResult, NotationMode, SourceMapRange } from './notation/types'

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
  transpose: number
  parts: string
}

type BodyConversionResult = {
  body: string
  mappings: SourceMapRange[]
  lastKey: string
  lastMeter: Meter
  lastTempo: string
}

const defaultHeader: HeaderState = {
  title: '',
  subtitle: '',
  composer: '',
  lyricist: '',
  key: 'C',
  meter: { beats: 4, beatValue: 4 },
  tempo: '',
  transpose: 0,
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

function keyToAbc(rawKey: string) {
  const { tonic, mode } = parseKey(rawKey)
  return `${tonic}${abcKeyAliases[mode] ?? mode}`
}

export function romanChordToAbc(roman: string, key: string) {
  const romanToDegree: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 }
  const degreeMatch = /^([IVX]+)(m|dim|aug|sus[24]?|[2-9]|1[0-3])?$/i.exec(roman)
  if (!degreeMatch) return null
  const degreeNum = romanToDegree[degreeMatch[1].toUpperCase()]
  if (degreeNum === undefined) return null
  const root = degreeToLetter(degreeNum, key)
  const suffix = degreeMatch[2] ?? ''
  const isLowerRoman = degreeMatch[1] !== degreeMatch[1].toUpperCase()
  // Quality suffixes (m, dim, aug) already encode the chord quality
  // Numeric suffixes (7, 9, etc.) need 'm' prefix for lowercase roman (minor quality)
  if (suffix === 'm' || suffix === 'dim' || suffix === 'aug') {
    return `"${root}${suffix}"`
  }
  if (suffix) {
    return `"${root}${isLowerRoman ? 'm' : ''}${suffix}"`
  }
  return `"${root}${isLowerRoman ? 'm' : ''}"`
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

  const notes = parseM3NGroupPitches(match[1])
  if (!notes || notes.length === 0) {
    return token
  }
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

function splitGracePitches(value: string) {
  const normalized = value.replace(/\s+/g, '')
  const notes = normalized.match(/[0-7][#b=]*[ed]*/g) ?? []
  return notes.join('') === normalized ? notes : null
}

function convertGraceAttribute(content: string, key: string) {
  const match = /^(ac|ap)\(([^)]+)\)$/.exec(content)
  if (!match) {
    return null
  }

  const notes = splitGracePitches(match[2])
  if (!notes || notes.length === 0 || notes.some((note) => !parseM3NNote(note))) {
    return null
  }

  const prefix = match[1] === 'ac' ? '/' : ''
  const value = `{${notes.map((note) => `${prefix}${convertM3NNotePitch(note, key)}`).join('')}}`
  return value
}

function groupDurationInBeats(token: string, depth: number) {
  const match = /^\[([^\]:]+):([^\]]+)\](\^*)(\.*)~?$/.exec(token)
  if (!match) {
    return 0
  }

  const notes = parseM3NGroupPitches(match[1])
  if (!notes || notes.length === 0) {
    return 0
  }
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
  // Beam span in quarter notes: compound meters (6/8, 9/8, 12/8) beam in groups of 3 eighth notes = 1.5 quarter notes
  return meter.beatValue === 8 && meter.beats % 3 === 0 ? 1.5 : 1
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

function convertAttribute(content: string, header: HeaderState, state: { keySeen: boolean; meterSeen: boolean; tempoSeen: boolean; currentKey: string; currentMeter: Meter; currentTempo: string }) {
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
    const newKey = content.slice('key='.length)
    if (!state.keySeen) {
      state.keySeen = true
      header.key = newKey
      state.currentKey = newKey
    } else if (newKey !== state.currentKey) {
      state.currentKey = newKey
      return `[K:${keyToAbc(newKey)}]`
    }
    return ''
  }
  if (content.startsWith('1=')) {
    const newKey = content.slice('1='.length)
    if (!state.keySeen) {
      state.keySeen = true
      header.key = newKey
      state.currentKey = newKey
    } else if (newKey !== state.currentKey) {
      state.currentKey = newKey
      return `[K:${keyToAbc(newKey)}]`
    }
    return ''
  }
  if (/^\d+\/\d+$/.test(content)) {
    const [beats, beatValue] = content.split('/').map(Number)
    const newMeter = { beats, beatValue }
    if (!state.meterSeen) {
      state.meterSeen = true
      header.meter = newMeter
      state.currentMeter = newMeter
    } else if (newMeter.beats !== state.currentMeter.beats || newMeter.beatValue !== state.currentMeter.beatValue) {
      state.currentMeter = newMeter
      return `[M:${newMeter.beats}/${newMeter.beatValue}]`
    }
    return ''
  }
  if (/^\d+qpm$/i.test(content)) {
    const newTempo = content.replace(/qpm$/i, '')
    if (!state.tempoSeen) {
      state.tempoSeen = true
      header.tempo = newTempo
      state.currentTempo = newTempo
    } else if (newTempo !== state.currentTempo) {
      state.currentTempo = newTempo
      return `[Q:1/4=${newTempo}]`
    }
    return ''
  }
  if (content.startsWith('transpose=')) {
    const value = content.slice('transpose='.length)
    if (/^-?\d+$/.test(value)) {
      header.transpose = Number(value)
    }
    return ''
  }
  if (content.startsWith('parts=')) {
    header.parts = content.slice('parts='.length)
    return ''
  }
  if (content.startsWith('part=')) {
    return `\nP:${content.slice('part='.length)}\n`
  }
  if (content.startsWith('rest=')) {
    return `Z${content.slice('rest='.length)}`
  }
  if (content.startsWith('chord=')) {
    const chordValue = content.slice('chord='.length)
    const abc = romanChordToAbc(chordValue, state.currentKey)
    return abc ?? ''
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
  if (content === 'tip') {
    return '.'
  }
  if (content === 'brk') {
    return '!wedge!'
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
  if (/^(ppp|pp|p|mp|mf|f|ff|fff|sfz)$/.test(content)) {
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

  return ''
}

function convertM3NLyrics(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => (token === '%' ? '*' : token))
    .join(' ')
}

function partOrderToAbc(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).join(' ')
}

function partOrderToM3N(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).join(' ')
}

export function m3nToAbc(source: string): ConversionResult {
  const diagnostics: string[] = []
  const header: HeaderState = structuredClone(defaultHeader)
  const { main, bass, lyrics } = splitSupplementBlocks(source)
  const bodyResult = convertM3NBody(main, header, diagnostics)
  // header.key/meter/tempo now hold the FIRST values (for ABC header)
  const melodyFirstKey = header.key
  const melodyFirstMeter = { ...header.meter }
  const melodyFirstTempo = header.tempo
  // Set header to current state at end of melody for bass processing
  header.key = bodyResult.lastKey
  header.meter = bodyResult.lastMeter
  header.tempo = bodyResult.lastTempo
  const bassResult = bass ? convertM3NBody(bass, header, diagnostics, false) : null
  const body = bodyResult.body.trim()
  const bassBody = bassResult?.body.trim() ?? ''
  const partOrder = header.parts ? partOrderToAbc(header.parts) : ''
  // If bass body exists and its start key/meter differs from the header,
  // prepend inline directives so the bass voice starts correctly
  const bassPrefixParts: string[] = []
  if (bassBody) {
    if (bodyResult.lastKey !== melodyFirstKey) {
      bassPrefixParts.push(`K:${keyToAbc(bodyResult.lastKey)}`)
    }
    if (bodyResult.lastMeter.beats !== melodyFirstMeter.beats || bodyResult.lastMeter.beatValue !== melodyFirstMeter.beatValue) {
      bassPrefixParts.push(`M:${bodyResult.lastMeter.beats}/${bodyResult.lastMeter.beatValue}`)
    }
  }
  const bassPrefix = bassPrefixParts.length ? bassPrefixParts.join('\n') + '\n' : ''
  const lines = [
    'X:1',
    header.title ? `T:${header.title}` : '',
    header.subtitle ? `T:${header.subtitle}` : '',
    header.composer ? `C:${header.composer}` : '',
    partOrder ? `P:${partOrder}` : '',
    `M:${melodyFirstMeter.beats}/${melodyFirstMeter.beatValue}`,
    'L:1/4',
    melodyFirstTempo ? `Q:1/4=${melodyFirstTempo}` : '',
    // Use piano for score voices and the automatic accompaniment bass.
    '%%MIDI program 0',
    '%%MIDI bassprog 0',
    // abcjs turns quoted ABC chords into its own accompaniment track.
    '%%MIDI chordprog 24',
    header.transpose ? `%%MIDI transpose ${header.transpose}` : '',
    `K:${keyToAbc(melodyFirstKey)}`,
    bassBody ? '%%score { melody | bass }' : '',
    bassBody ? 'V:melody clef=treble' : '',
    body.trim(),
    ...lyrics.map((item) => `w:${convertM3NLyrics(item.text)}`),
    bassBody ? 'V:bass clef=bass' : '',
    bassPrefix + bassBody,
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
  treatInitialAttributesAsHeader = true,
): BodyConversionResult {
  const output: string[] = []
  const mappings: SourceMapRange[] = []
  let depth = 0
  let index = 0
  let line = 1
  let beatPosition = 0
  let groupBoundary = false
  const intervalAttributes: IntervalAttribute[] = []
  const structuralIntervals: Array<{ name: string; voltaStartBeat?: number }> = []
  let lastNotationOutputIndex: number | null = null
  let lastNotationMappingIndex: number | null = null
  const state = {
    keySeen: !treatInitialAttributesAsHeader,
    meterSeen: !treatInitialAttributesAsHeader,
    tempoSeen: !treatInitialAttributesAsHeader,
    currentKey: header.key,
    currentMeter: { ...header.meter },
    currentTempo: header.tempo,
  }

  const outputLength = () => output.join('').length

  const pushMapped = (value: string, sourceStart: number, sourceEnd: number, prefix = '') => {
    const outputStart = outputLength()
    output.push(`${prefix}${value}`)
    lastNotationOutputIndex = output.length - 1
    lastNotationMappingIndex = mappings.length
    mappings.push({
      outputStart: outputStart + prefix.length,
      outputEnd: outputStart + prefix.length + value.length,
      sourceStart,
      sourceEnd,
    })
  }

  const prependToNotation = (value: string, outputIndex: number | null, mappingIndex: number | null) => {
    if (outputIndex === null || mappingIndex === null) {
      return
    }

    output[outputIndex] = `${value}${output[outputIndex]}`
    const mapping = mappings[mappingIndex]
    if (mapping) {
      mapping.outputStart += value.length
      mapping.outputEnd += value.length
    }
  }

  const advanceBeatPosition = (duration: number) => {
    const span = beamSpanInBeats(state.currentMeter)
    const prevBeatPosition = beatPosition
    beatPosition = (beatPosition + duration) % span
    if (beatPosition < Number.EPSILON || span - beatPosition < Number.EPSILON) {
      beatPosition = 0
    }
    // Break beam at beat boundaries inside beam groups (depth > 0)
    if (prevBeatPosition > 0 && beatPosition === 0 && depth > 0) {
      output.push(' ')
    }
  }

  while (index < source.length) {
    const rest = source.slice(index)
    const whitespace = /^\s+/.exec(rest)
    if (whitespace) {
      const shouldBreakBeam =
        groupBoundary ||
        depth === 0 &&
          (beatPosition === 0 || beamSpanInBeats(state.currentMeter) - beatPosition < Number.EPSILON)
      if (shouldBreakBeam) {
        output.push(' ')
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

    const bar = /^(?::\|\|\||:\|\|:|:\|\||\|\|\||\|\|:|\|\||\|)/.exec(rest)
    if (bar) {
      const map: Record<string, string> = {
        '|': '|',
        '||': '||',
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
      if (groupBoundary) {
        output.push(' ')
      }
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
      const structuralName = content.startsWith('volta=')
        ? 'volta'
        : content.startsWith('part=')
          ? 'part'
          : content
      if (structuralName === 'cresc' || structuralName === 'decres' || structuralName === '8va' || structuralName === '8vb' || structuralName === 'lg' || structuralName === 'volta' || structuralName === 'part') {
        structuralIntervals.push({
          name: structuralName,
          voltaStartBeat: structuralName === 'volta' ? beatPosition : undefined,
        })
      } else if (content === '/') {
        const closed = structuralIntervals.pop()
        const afterClose = source.slice(index + attribute[0].length).trimStart()
        if (closed?.name === 'volta' && afterClose.startsWith('{volta=')) {
          beatPosition = closed.voltaStartBeat ?? beatPosition
        }
      } else if (content.startsWith('/')) {
        structuralIntervals.pop()
      }
      let value = ''
      const grace = convertGraceAttribute(content, state.currentKey)
      if (grace) {
        prependToNotation(grace, lastNotationOutputIndex, lastNotationMappingIndex)
      } else if (content === '/') {
        value = intervalEndDecoration(intervalAttributes.pop() ?? '')
      } else {
        value = convertAttribute(content, header, state)
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
      pushMapped(convertGroup(group[0], depth, state.currentKey), index, index + group[0].length)
      advanceBeatPosition(groupDurationInBeats(group[0], depth))
      groupBoundary = false
      index += group[0].length
      continue
    }

    const note = /^(?:0|[1-7][#b=]*[ed]*)(?:\^+)?(?:\.*)?~?/.exec(rest)
    if (note) {
      pushMapped(convertM3NNote(note[0], depth, state.currentKey), index, index + note[0].length)
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
    lastKey: state.currentKey,
    lastMeter: state.currentMeter,
    lastTempo: state.currentTempo,
  }
}

function parseAbcHeader(source: string) {
  const header = structuredClone(defaultHeader)
  const body: string[] = []
  const lyrics: string[] = []
  let hasKey = false
  let hasMusic = false

  source.split(/\r?\n/).forEach((line) => {
    // ABC comments and processor directives are metadata, never notation.
    if (/^\s*%/.test(line)) {
      return
    }
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
      if (!hasMusic) {
        const [beats, beatValue] = line.slice(2).split('/').map(Number)
        if (beats && beatValue) {
          header.meter = { beats, beatValue }
        }
        return
      }
      // M: after music is an inline meter change, keep in body
      body.push(line)
      if (line.trim()) hasMusic = true
      return
    }
    if (/^Q:/.test(line)) {
      if (!hasMusic) {
        header.tempo = line.split('=').at(-1)?.trim() ?? header.tempo
        return
      }
      // Q: after music is an inline tempo change, keep in body
      body.push(line)
      if (line.trim()) hasMusic = true
      return
    }
    const midiTranspose = /^%%MIDI\s+transpose\s+(-?\d+)\s*$/i.exec(line)
    if (midiTranspose) {
      header.transpose = Number(midiTranspose[1])
      return
    }
    if (/^K:/.test(line)) {
      if (!hasMusic) {
        header.key = line.slice(2).trim()
        hasKey = true
        return
      }
      // K: after music content is an inline key change, keep in body
      body.push(line)
      if (line.trim()) hasMusic = true
      return
    }
    if (/^P:/.test(line)) {
      const value = line.slice(2).trim()
      if (!hasMusic && !header.parts && (!hasKey || /\s/.test(value))) {
        header.parts = partOrderToM3N(value)
      } else {
        body.push(line)
      }
      return
    }
    if (/^V:/.test(line)) {
      body.push(line)
      return
    }
    if (/^[Ww]:/.test(line)) {
      lyrics.push(line.slice(2).trim())
      return
    }
    if (/^L:/.test(line)) {
      // L: in header is handled by the M: logic (L:1/beatValue)
      // L: in body is an inline default-length change after meter change, keep it
      if (hasMusic) {
        body.push(line)
      }
      return
    }
    if (/^[A-Za-z]:/.test(line)) {
      return
    }
    body.push(line)
    if (line.trim()) {
      hasMusic = true
    }
  })

  return { header, body: body.join('\n'), lyrics }
}

function parseAbcDuration(value: string): { num: number; den: number } {
  if (!value) return { num: 1, den: 1 }
  if (value.includes('/')) {
    const parts = value.split('/')
    return { num: parts[0] && parts[0] !== '' ? Number(parts[0]) : 1, den: Number(parts[1]) || 1 }
  }
  return { num: Number(value) || 1, den: 1 }
}

function abcNoteToM3N(token: string, key: string, unitLength = 4) {
  const hasTie = token.endsWith('-')
  const normalizedToken = hasTie ? token.slice(0, -1) : token

  if (/^Z/.test(normalizedToken)) {
    return `{rest=${normalizedToken.slice(1) || '1'}}`
  }

  if (/^z/.test(normalizedToken)) {
    return applyAbcDurationToM3N('0', normalizedToken.slice(1), false, unitLength)
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
  return applyAbcDurationToM3N(base, durationRaw, hasTie, unitLength)
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

export function abcChordToRoman(chordName: string, key: string) {
  const { tonic } = parseKey(key)
  const match = /^([A-G](?:#|b)?)(maj\d*|min\d*|m\d*|dim\d*|aug\d*|sus[24]?|[2-9]\d*|1[0-3]\d*)?$/i.exec(chordName)
  if (!match) return chordName
  const root = match[1]
  const suffix = match[2] ?? ''
  const tonicLetter = tonic[0]?.toUpperCase() ?? 'C'
  const tonicIndex = pitchLetters.indexOf(tonicLetter)
  const rootIndex = pitchLetters.indexOf(root[0].toUpperCase())
  if (rootIndex === -1) return chordName
  const normalizedTonicIndex = tonicIndex === -1 ? 0 : tonicIndex
  const normalizedRootIndex = rootIndex === -1 ? normalizedTonicIndex : rootIndex
  const degree = ((normalizedRootIndex - normalizedTonicIndex + pitchLetters.length) % pitchLetters.length) + 1
  const degreeToRoman: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII' }
  const roman = degreeToRoman[degree]
  if (!roman) return chordName
  const isMinor = /^(m|min)\d*$/i.test(suffix)
  const isDim = /^dim/i.test(suffix)
  // Uppercase roman = major, lowercase roman = minor/diminished
  const romanWithCase = (isMinor || isDim) ? roman.toLowerCase() : roman
  // For M3N: lowercase roman already encodes minor quality, no extra 'm' needed
  // Numeric extensions (7, 9, etc.) are appended after the roman numeral
  const numericSuffix = suffix.replace(/^(m|min|maj)/i, '')
  if (numericSuffix) {
    return `${romanWithCase}${numericSuffix}`
  }
  // No numeric suffix: just the roman numeral (case = quality)
  // Special case: dim/aug without number
  if (isDim) return `${romanWithCase}dim`
  if (/^aug/i.test(suffix)) return `${romanWithCase}aug`
  return romanWithCase
}

function convertAbcDecorations(value: string, key: string) {
  return value
    .replace(/\[K:([^\]]+)\]/g, (_match, key) => `{key=${key.trim()}}`)
    .replace(/\[M:(\d+\/\d+)\]/g, (_match, meter) => `{${meter}}`)
    .replace(/\[Q:[^\]]*\b(\d+)\s*\]/g, (_match, tempo) => `{${tempo}qpm}`)
    .replace(/!([A-Za-z0-9.()]+)!/g, (_match, name) => abcDecorationToM3N[name] ?? '')
    .replace(/"([^"]+)"/g, (_match, label) =>
      String(label).startsWith('^') ? `{text=${String(label).slice(1)}}` : `{chord=${abcChordToRoman(label, key)}}`,
    )
}

function applyAbcDurationToHarmonyGroup(notes: string[], value: string, hasTie = false, unitLength = 4) {
  const tie = hasTie ? '~' : ''
  const { num, den } = parseAbcDuration(value)
  const quarterCount = (num / den) * (4 / unitLength)

  if (quarterCount === 1) return `[${notes.join('')}:h]${tie}`
  if (quarterCount === 2) return `[${notes.join('')}:h]^${tie}`
  if (quarterCount === 4) return `[${notes.join('')}:h]^^${tie}`
  if (quarterCount === 3) return `[${notes.join('')}:h]^.${tie}`
  if (quarterCount === 0.5) return `([${notes.join('')}:h]${tie})`
  if (quarterCount === 0.25) return `(([${notes.join('')}:h]${tie}))`
  if (quarterCount === 1.5) return `[${notes.join('')}:h].${tie}`
  if (quarterCount === 0.75) return `([${notes.join('')}:h].${tie})`
  if (quarterCount === 0.125) return `((([${notes.join('')}:h]${tie})))`

  return `[${notes.join('')}:h]${tie}`
}

function abcNoteWithoutDuration(token: string) {
  return token.replace(/^([_=^]*[A-Ga-g][,']*)[0-9/]*(-?)$/, '$1$2')
}

function convertAbcLyrics(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => (token === '*' ? '%' : token))
    .join(' ')
}

function abcGraceToM3N(value: string, key: string) {
  const normalized = value.replace(/\s+/g, '')
  const notes = normalized.match(/\/?[_=^]*[A-Ga-g][,']*[0-9/]*-?/g)
  if (!notes || notes.join('') !== normalized) {
    return null
  }

  const isAcciaccatura = notes.every((note) => note.startsWith('/'))
  if (!isAcciaccatura && notes.some((note) => note.startsWith('/'))) {
    return null
  }

  const kind = isAcciaccatura ? 'ac' : 'ap'
  const m3nNotes = notes.map((note) => abcNoteToM3N(note.replace(/^\//, ''), key)).join('')
  return `{${kind}(${m3nNotes})}`
}

function convertAbcNotesWithoutTouchingAttributes(value: string, key: string, unitLength = 4) {
  const attributes: string[] = []
  const groups: string[] = []
  const notePattern = '[_=^]*[A-Ga-g][,\']*[0-9/]*-?'
  const protectedValue = value
    .replace(new RegExp(`\\{([^{}]+)\\}(${notePattern})`, 'g'), (match, graceRaw, note) => {
      const grace = abcGraceToM3N(String(graceRaw), key)
      if (!grace) {
        return match
      }
      const marker = `¤${groups.length}¤`
      groups.push(`${abcNoteToM3N(String(note), key, unitLength)}${grace}`)
      return marker
    })
    .replace(/\{[^}]+\}/g, (match) => {
      const marker = `§${attributes.length}§`
      attributes.push(match)
      return marker
    })

  return protectedValue
    .replace(/\((\d+):(\d+):\d+((?:[_=^]*[A-Ga-g][,']*[0-9/]*-?)+)/g, (_match, _count, units, notesRaw) => {
      const notes = String(notesRaw).match(/[_=^]*[A-Ga-g][,']*[0-9/]*-?/g) ?? []
      const value = `[${notes.map((note) => abcNoteToM3N(note, key, unitLength).replace(/[().]/g, '')).join('')}:${units}]`
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
            notes.map((note) => abcNoteToM3N(abcNoteWithoutDuration(note), key, unitLength)),
            chordDuration,
            Boolean(chordTie),
            unitLength,
          )
        : `[${notes.map((note) => abcNoteToM3N(note, key, unitLength)).join('')}:h]`
      const marker = `¤${groups.length}¤`
      groups.push(value)
      return marker
    })
    .replace(/(?:Z[0-9]+|[_=^]*[A-Ga-gz][,']*[0-9/]*-?)/g, (token) => abcNoteToM3N(token, key, unitLength))
    .replace(/¤(\d+)¤/g, (_match, index) => groups[Number(index)] ?? '')
    .replace(/§(\d+)§/g, (_match, index) => attributes[Number(index)] ?? '')
}

function applyAbcDurationToM3N(base: string, value: string, hasTie = false, unitLength = 4) {
  const tie = hasTie ? '~' : ''
  const { num, den } = parseAbcDuration(value)
  const quarterCount = (num / den) * (4 / unitLength)

  if (quarterCount === 1) return `${base}${tie}`
  if (quarterCount === 2) return `${base}^${tie}`
  if (quarterCount === 4) return `${base}^^${tie}`
  if (quarterCount === 3) return `${base}^.${tie}`
  if (quarterCount === 0.5) return `(${base}${tie})`
  if (quarterCount === 0.25) return `((${base}${tie}))`
  if (quarterCount === 1.5) return `${base}.${tie}`
  if (quarterCount === 0.75) return `(${base}.)${tie}`  // dotted eighth: half then dot
  if (quarterCount === 0.125) return `(((${base}${tie})))`

  return `${base}${tie}`
}

export function abcToM3N(source: string): ConversionResult {
  const { header, body, lyrics } = parseAbcHeader(source)
  const output: string[] = [
    header.title ? `{title=${header.title}}` : '',
    header.subtitle ? `{subtitle=${header.subtitle}}` : '',
    header.composer ? `{composer=${header.composer}}` : '',
    header.parts ? `{parts=${header.parts}}` : '',
    `{key=${header.key || 'C'}} {${header.meter.beats}/${header.meter.beatValue}}${header.tempo ? ` {${header.tempo}qpm}` : ''}${header.transpose ? ` {transpose=${header.transpose}}` : ''}`,
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

  const convertAbcBody = (value: string, initialKey: string, initialMeter: Meter) => {
    type AbcSegment = { key: string; text: string; prefixAttrs: string[] }
    const segments: AbcSegment[] = []
    let currentKey = initialKey
    let currentUnitLength = initialMeter.beatValue  // denominator of L:
    let pendingAttrs: string[] = []
    let currentLines: string[] = []

    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.trim()
      const keyMatch = /^K:\s*(.*)$/.exec(trimmed)
      const meterMatch = /^M:\s*(\d+)\/(\d+)\s*$/.exec(trimmed)
      const lMatch = /^L:\s*(\d+)\/(\d+)\s*$/.exec(trimmed)
      const tempoMatch = /^Q:.*=(\d+)\s*$/.exec(trimmed)
      if (keyMatch || meterMatch || tempoMatch) {
        if (currentLines.some((l) => l.trim())) {
          segments.push({ key: currentKey, text: currentLines.join('\n'), prefixAttrs: pendingAttrs })
          pendingAttrs = []
        }
        if (keyMatch) {
          currentKey = keyMatch[1].trim()
          pendingAttrs.push(`key=${currentKey}`)
        }
        if (meterMatch) {
          const newBeatValue = Number(meterMatch[2])
          currentUnitLength = newBeatValue
          pendingAttrs.push(`${meterMatch[1]}/${newBeatValue}`)
        }
        if (tempoMatch) {
          pendingAttrs.push(`${tempoMatch[1]}qpm`)
        }
        currentLines = []
        continue
      }
      // Inline L: updates the unit length for correct note duration conversion
      if (lMatch) {
        currentUnitLength = Number(lMatch[2])
        continue
      }
      currentLines.push(line)
    }
    if (currentLines.some((l) => l.trim())) {
      segments.push({ key: currentKey, text: currentLines.join('\n'), prefixAttrs: pendingAttrs })
    } else if (pendingAttrs.length) {
      if (segments.length) {
        segments[segments.length - 1].prefixAttrs.push(...pendingAttrs)
      }
    }

    return segments
      .map((segment, index) => {
        const prefix = segment.prefixAttrs.length
          ? segment.prefixAttrs.map((a) => `{${a}}`).join(' ') + ' '
          : ''
        // Determine L: for this segment: first segment uses initialMeter, others infer from attrs
        const unitLength = index === 0 ? initialMeter.beatValue : currentUnitLength
        const converted = convertAbcNotesWithoutTouchingAttributes(
          convertAbcDecorations(segment.text, segment.key)
            .replace(/^P:([^\n]+)/gm, (_match, value) => `{part=${String(value).trim()}}`)
            .replace(/\[(\d+)\s+/g, (_match, value) => `{volta=${value}} `),
          segment.key,
          unitLength,
        )
          .replace(/\|:/g, '||:')
          .replace(/:\|\]/g, ':|||')
          .replace(/:\|/g, ':||')
          .replace(/\|\]/g, '|||')
          .replace(/\|/g, '|')
          .replace(/:\|{4,}/g, ':|||')
        return prefix + converted
      })
      .join(' ')
  }

  output.push(convertAbcBody(bodyLines.join('\n'), header.key, header.meter))

  if (bassLines.some((line) => line.trim())) {
    output.push('', '{bass}', convertAbcBody(bassLines.join('\n'), header.key, header.meter), '{/}')
  }

  lyrics.forEach((line) => {
    const range = /^\[([^\]]+)\]\s*(.*)$/.exec(line)
    const text = range ? range[2] : line
    output.push('', range ? `{lyrics=${range[1]}}` : '{lyrics}', convertAbcLyrics(text), '{/}')
  })

  return {
    source,
    output: output.join('\n'),
    diagnostics: [],
  }
}

export async function convertNotation(source: string, from: NotationMode): Promise<ConversionResult> {
  const result = from === 'm3n' ? m3nToAbc(source) : abcToM3N(source)
  return result
}

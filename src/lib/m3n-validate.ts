import { durationInBeats, keyModeIntervals } from './notation/m3n-primitives'
import { parseM3NGrace } from './notation/m3n-groups'
import { parseLyricItems, type LyricMode } from './notation/lyrics'
import { tokenizeM3N, type M3NToken as Token } from './notation/m3n-tokens'
import { parseM3NDocument } from './m3n-direct'

type Meter = { beats: number; beatValue: number }
type Settings = { key: string; meter: Meter; tempo: number | null }

type Measure = {
  actual: number
  expected: number
  line: number
  barEnd: number
  number: number
  repeatEnd: boolean
  repeatStart: boolean
  repeatStartId?: number
  repeatTargetId?: number
}

type Unit = {
  name: string | null
  measures: Measure[]
  beats: number
  expected: number
  measureLine: number
  hasAtom: boolean
  currentHasAtom: boolean
  multiRestPendingBar: boolean
  commonLyrics: number
  voltaLyrics: Map<number, number>
}

type ParsedPitch = {
  degree: number
  accidental: string
  octave: string
}

type PendingTie = {
  kind: 'note' | 'harmony'
  pitches: number[]
  line: number
}

type SettingEvent = {
  beat: number
  kind: 'key' | 'meter' | 'tempo'
  value: string
}

type Block = {
  name: string
  line: number
  range?: Set<number>
  octaveShift?: number
  tempoTarget?: number
}

type Supplement = {
  kind: 'lyrics' | 'bass'
  line: number
  range: string | null
  tokens: Token[]
  lyricMode?: LyricMode
}

const INFO_FIELDS = new Set([
  'title', 'subtitle', 'singer', 'composer', 'lyricist', 'arranger',
  'copyright', 'source', 'note', 'transpose',
])

const INTERVAL_FLAGS = new Set(['cresc', 'decres', 'lg', '8va', '8vb', 'inst'])
const DYNAMICS = new Set(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'])
const POSTFIX_FLAGS = new Set([
  'arp', 'tr', 'str', 'brk', 'tip', 'hold', 'fermata', 'breath', 'f1', 'f2', 'f3', 'f4', 'f5',
])

const KEY_PATTERN = /^([A-G](?:#|b)?)(dor|phr|lyd|mix|m|loc)?$/
const CHORD_PATTERN = /^(I|II|III|IV|V|VI|VII|i|ii|iii|iv|v|vi|vii)(?:m|dim|aug|sus2|sus4|[2-9]|1[0-3])?$/

function lineMessage(token: Token, message: string) {
  return `第 ${token.line} 行：${message}`
}

function isTrivia(token: Token) {
  return token.kind === 'space' || token.kind === 'comment'
}

function attributeName(content: string) {
  const equals = content.indexOf('=')
  return equals === -1 ? content : content.slice(0, equals)
}

function openingBlockName(content: string): string | null {
  if (INTERVAL_FLAGS.has(content)) return content
  if (content.startsWith('volta=')) return 'volta'
  if (content.startsWith('part=')) return 'part'
  if (content === 'lyrics' || content.startsWith('lyrics=') || content === 'lyrics-word' || content.startsWith('lyrics-word=')) return 'lyrics'
  if (content === 'bass') return 'bass'
  return null
}

function closingBlockName(content: string) {
  if (content === '/') return null
  return content.startsWith('/') ? content.slice(1) : undefined
}

function parseRange(value: string, label: string): { values: Set<number>; error: string | null } {
  const values = new Set<number>()
  if (!value) return { values, error: `${label}遍次范围为空` }
  let previous = 0
  for (const item of value.split(',')) {
    const single = /^\d+$/.exec(item)
    const range = /^(\d+)~(\d+)$/.exec(item)
    if (!single && !range) return { values, error: `${label}遍次范围格式非法：${value}` }
    const start = Number(single?.[0] ?? range?.[1])
    const end = Number(single?.[0] ?? range?.[2])
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end <= 0) {
      return { values, error: `${label}遍次必须为正整数` }
    }
    if (range && start >= end) return { values, error: `${label}闭区间起点必须小于终点` }
    for (let valueAt = start; valueAt <= end; valueAt += 1) {
      if (valueAt <= previous || values.has(valueAt)) {
        return { values, error: `${label}遍次必须严格递增且不得重复或重叠` }
      }
      values.add(valueAt)
      previous = valueAt
    }
  }
  return { values, error: null }
}

function extractSupplements(tokens: Token[], diagnostics: string[]) {
  const main: Token[] = []
  const supplements: Supplement[] = []
  let current: Supplement | null = null
  let nested: string[] = []
  let supplementsStarted = false
  let restoredBodyReported = false

  for (const token of tokens) {
    if (current) {
      if (token.kind === 'attribute') {
        const content = token.content ?? ''
        const closing = closingBlockName(content)
        if (closing !== undefined) {
          if (nested.length > 0) {
            const expected = nested.at(-1)
            if (closing !== null && closing !== expected) {
              diagnostics.push(lineMessage(token, `区间关闭顺序错误：期望 {/${expected}}，实际 {/${closing}}`))
            } else {
              nested.pop()
            }
            current.tokens.push(token)
            continue
          }
          if (closing !== null && closing !== current.kind) {
            diagnostics.push(lineMessage(token, `补充块关闭名称错误：期望 {/${current.kind}}，实际 {/${closing}}`))
            current.tokens.push(token)
            continue
          }
          supplements.push(current)
          current = null
          continue
        }
        const opener = openingBlockName(content)
        if (opener) {
          if (current.kind === 'lyrics' || opener === 'lyrics' || opener === 'bass' || opener === 'part') {
            diagnostics.push(lineMessage(token, '补充块不能嵌套'))
          }
          nested.push(opener)
        }
      }
      current.tokens.push(token)
      continue
    }

    if (token.kind === 'attribute') {
      const content = token.content ?? ''
      const lyric = /^(lyrics(?:-word)?)(?:=(.*))?$/.exec(content)
      if (lyric || content === 'bass') {
        supplementsStarted = true
        current = {
          kind: lyric ? 'lyrics' : 'bass',
          line: token.line,
          range: lyric ? (lyric[2] ?? null) : null,
          tokens: [],
          lyricMode: lyric?.[1] === 'lyrics-word' ? 'word' : 'char',
        }
        nested = []
        continue
      }
    }

    if (!supplementsStarted) {
      main.push(token)
    } else if (!isTrivia(token) && !restoredBodyReported) {
      diagnostics.push(lineMessage(token, '第一个补充块开始后不能恢复乐谱正文'))
      restoredBodyReported = true
    }
  }

  if (current) diagnostics.push(`第 ${current.line} 行：未闭合的补充块：{${current.kind}}`)
  return { main, supplements }
}

function parsePitch(raw: string): { pitch: ParsedPitch | null; error: string | null } {
  const match = /^([1-7])([#b=]*)([ed]*)$/.exec(raw)
  if (!match) return { pitch: null, error: `音高格式非法：${raw}` }
  const accidental = match[2]
  const octave = match[3]
  if ((accidental.includes('#') && accidental.includes('b')) || (accidental.includes('=') && accidental !== '=')) {
    return { pitch: null, error: `临时变音组合非法：${raw}` }
  }
  if (accidental.length > 2) return { pitch: null, error: `临时变音最多只能使用两个同类记号：${raw}` }
  if (octave.includes('e') && octave.includes('d')) {
    return { pitch: null, error: `八度方向混用：${raw}` }
  }
  return {
    pitch: { degree: Number(match[1]), accidental, octave },
    error: null,
  }
}

function splitPitchSequence(source: string): { pitches: ParsedPitch[]; hasRest: boolean; error: string | null } {
  const normalized = source.replace(/\s+/g, '')
  const pitches: ParsedPitch[] = []
  let hasRest = false
  let index = 0
  while (index < normalized.length) {
    if (normalized[index] === '0') {
      hasRest = true
      index += 1
      continue
    }
    const token = /^[1-7][#b=]*[ed]*/.exec(normalized.slice(index))?.[0]
    if (!token) return { pitches, hasRest, error: `元素序列含非法内容：${source}` }
    const parsed = parsePitch(token)
    if (!parsed.pitch) return { pitches, hasRest, error: parsed.error }
    pitches.push(parsed.pitch)
    index += token.length
  }
  return { pitches, hasRest, error: null }
}

function tonicPitchClass(key: string) {
  const match = KEY_PATTERN.exec(key)
  if (!match) return 0
  const natural: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  return natural[match[1][0]] + (match[1].endsWith('#') ? 1 : match[1].endsWith('b') ? -1 : 0)
}

function keyMode(key: string) {
  return KEY_PATTERN.exec(key)?.[2] ?? ''
}

function octaveShift(value: string) {
  return [...value].reduce((sum, char) => sum + (char === 'e' ? 1 : -1), 0)
}

function createUnit(name: string | null, meter: Meter, line: number): Unit {
  return {
    name,
    measures: [],
    beats: 0,
    expected: meter.beats * 4 / meter.beatValue,
    measureLine: line,
    hasAtom: false,
    currentHasAtom: false,
    multiRestPendingBar: false,
    commonLyrics: 0,
    voltaLyrics: new Map(),
  }
}

function validateUnitMeasures(unit: Unit, diagnostics: string[], skipBeatValidation = false, invalidBarEnds?: Set<number>) {
  if (skipBeatValidation || unit.measures.length === 0) return
  const equal = (a: number, b: number) => Math.abs(a - b) < 1e-9
  const markInvalidBar = (measure: Measure) => {
    if (measure.barEnd >= 0) invalidBarEnds?.add(measure.barEnd)
  }
  const location = (measure: Measure) => `第 ${measure.line} 行，第 ${measure.number} 小节`
  const measures = unit.measures
  const isComplementaryRepeatFragment = (index: number) => {
    const measure = measures[index]!
    const previous = measures[index - 1]
    const next = measures[index + 1]
    if (measure.repeatStart && previous && equal(measure.actual + previous.actual, measure.expected)) return true
    if (next?.repeatStart && equal(measure.actual + next.actual, measure.expected)) return true
    if (measure.repeatEnd) {
      const target = measure.repeatTargetId === undefined
        ? measures[0]
        : measures.find((candidate) => candidate.repeatStartId === measure.repeatTargetId)
      if (target && equal(measure.actual + target.actual, measure.expected)) return true
    }
    return Boolean(previous?.repeatEnd && equal(measure.actual + previous.actual, measure.expected))
  }
  for (const measure of measures) {
    if (measure.actual > measure.expected && !equal(measure.actual, measure.expected)) {
      diagnostics.push(`${location(measure)}：小节拍数超出：期望 ${measure.expected} 拍，实际 ${measure.actual} 拍`)
      markInvalidBar(measure)
    }
  }
  if (measures.length === 1) {
    const only = measures[0]
    if (!equal(only.actual, only.expected)) {
      diagnostics.push(`${location(only)}：单个小节拍数必须满拍：期望 ${only.expected} 拍，实际 ${only.actual} 拍`)
      markInvalidBar(only)
    }
    return
  }
  for (const [index, measure] of measures.slice(1, -1).entries()) {
    if (!equal(measure.actual, measure.expected) && !isComplementaryRepeatFragment(index + 1)) {
      diagnostics.push(`${location(measure)}：中间小节拍数不合规：期望 ${measure.expected} 拍，实际 ${measure.actual} 拍`)
      markInvalidBar(measure)
    }
  }
  const first = measures[0]
  const last = measures.at(-1)!
  const firstCompletesAtRepeatStart = measures[1]?.repeatStart && equal(first.actual + measures[1].actual, first.expected)
  if (equal(first.actual, first.expected) || firstCompletesAtRepeatStart) {
    if (!equal(last.actual, last.expected)) {
      diagnostics.push(`${location(last)}：没有弱起时末小节拍数必须满拍：期望 ${last.expected} 拍，实际 ${last.actual} 拍`)
      markInvalidBar(last)
    }
  } else if (!equal(first.expected, last.expected) || !equal(first.actual + last.actual, first.expected)) {
    diagnostics.push(`${location(first)} 与 ${location(last)}：首末小节拍数不互补：首 ${first.actual} 拍 + 末 ${last.actual} 拍，完整小节为 ${first.expected} 拍`)
    markInvalidBar(first)
    markInvalidBar(last)
  }
}

function validateBody(
  tokens: Token[],
  diagnostics: string[],
  options: { bass?: boolean; initial?: Settings; inheritedSettingEvents?: SettingEvent[]; skipBeatValidation?: boolean; invalidBarEnds?: Set<number> } = {},
) {
  const bass = options.bass ?? false
  const skipBeatValidation = options.skipBeatValidation ?? false
  const defaultSettings: Settings = options.initial
    ? structuredClone(options.initial)
    : { key: 'C', meter: { beats: 4, beatValue: 4 }, tempo: null }
  let commonSettings = structuredClone(defaultSettings)
  let settings = structuredClone(defaultSettings)
  let unit = createUnit(null, settings.meter, tokens[0]?.line ?? 1)
  const completedUnits: Unit[] = []
  const unitsByPart = new Map<string, Unit>()
  const blocks: Block[] = []
  const parens: Array<{ line: number; atoms: number }> = []
  const accidentalState = new Map<string, number>()
  const infoSeen = new Set<string>()
  const referencedParts: string[] = []
  const definedParts = new Set<string>()
  const voltaRanges = new Map<number, Set<number>>()
  let partOrderSeen = false
  let firstPartSeen = false
  let currentPart: string | null = null
  let firstMusicSeen = false
  let terminalCount = 0
  let terminalSeen = false
  let terminalTailReported = false
  let fineBeforeTerminal = false
  let postfixTarget: 'note' | 'harmony' | false = false
  let pendingSfz: Token | null = null
  let pendingTie: PendingTie | null = null
  let repeatOpen: { line: number; id: number } | null = null
  let repeatId = 0
  let currentVoltaRepeat = 0
  let completedVoltaGroup = false
  let voltaNeedsBar = false
  let repeatCountTarget = false
  let segnoCount = 0
  let jumpCount = 0
  let dsCount = 0
  let bodyInitial = structuredClone(defaultSettings)
  let elapsedBeats = 0
  let inheritedEventIndex = 0
  const settingEvents: SettingEvent[] = []
  const inheritedSettingEvents = options.inheritedSettingEvents ?? []

  const activeVolta = () => [...blocks].reverse().find((block) => block.name === 'volta')
  const activeOctaveShift = () => blocks.reduce((sum, block) => sum + (block.octaveShift ?? 0), 0)
  const isInstrumental = () => blocks.some((block) => block.name === 'inst')
  const currentTopLevel = () => blocks.length === 0

  let nextMeasureRepeatStart: number | undefined
  const commitMeasure = (line: number, barEnd = -1, repeatEnd = false, repeatTargetId?: number) => {
    if (unit.currentHasAtom && !unit.multiRestPendingBar) {
      unit.measures.push({ actual: unit.beats, expected: unit.expected, line: unit.measureLine, barEnd, number: unit.measures.length + 1, repeatEnd, repeatStart: nextMeasureRepeatStart !== undefined, repeatStartId: nextMeasureRepeatStart, repeatTargetId })
    }
    nextMeasureRepeatStart = undefined
    unit.beats = 0
    unit.currentHasAtom = false
    unit.multiRestPendingBar = false
    unit.measureLine = line
    accidentalState.clear()
  }

  const finishTie = () => {
    if (pendingTie) diagnostics.push(`第 ${pendingTie.line} 行：延音没有紧接的同类目标`)
    pendingTie = null
  }

  const finishRepeat = () => {
    if (repeatOpen) diagnostics.push(`第 ${repeatOpen.line} 行：前反复线无对应后反复线`)
    repeatOpen = null
    currentVoltaRepeat = 0
  }

  const finishUnit = () => {
    if (unit.currentHasAtom && !unit.multiRestPendingBar) commitMeasure(unit.measureLine)
    finishTie()
    finishRepeat()
    validateUnitMeasures(unit, diagnostics, bass || skipBeatValidation, options.invalidBarEnds)
    if (unit.name && !unit.hasAtom) diagnostics.push(`乐段 ${unit.name} 为空`)
    completedUnits.push(unit)
    if (unit.name) unitsByPart.set(unit.name, unit)
  }

  const startPart = (name: string, token: Token) => {
    if (currentPart) diagnostics.push(lineMessage(token, 'part 不能嵌套'))
    if (!currentTopLevel()) diagnostics.push(lineMessage(token, 'part 只能出现在乐谱正文顶层'))
    if (definedParts.has(name)) diagnostics.push(lineMessage(token, `乐段重复定义：${name}`))
    definedParts.add(name)
    if (!firstPartSeen && unit.hasAtom) diagnostics.push(lineMessage(token, '使用具名乐段后，乐段外不能存在音乐内容'))
    firstPartSeen = true
    if (unit.hasAtom || unit.measures.length > 0) finishUnit()
    settings = structuredClone(commonSettings)
    unit = createUnit(name, settings.meter, token.line)
    currentPart = name
    blocks.push({ name: 'part', line: token.line })
  }

  const closeBlock = (token: Token, named: string | null) => {
    const top = blocks.at(-1)
    if (!top) {
      diagnostics.push(lineMessage(token, `关闭指令没有对应开始：{/${named ?? ''}}`))
      return
    }
    if (named !== null && named !== top.name) {
      diagnostics.push(lineMessage(token, `区间关闭顺序错误：期望 {/${top.name}}，实际 {/${named}}`))
      return
    }
    blocks.pop()
    if (top.name === 'volta') {
      completedVoltaGroup = true
      voltaNeedsBar = true
    }
    if (top.name === 'part') {
      finishUnit()
      currentPart = null
      settings = structuredClone(commonSettings)
      unit = createUnit(null, settings.meter, token.line)
    }
    if (top.tempoTarget !== undefined) {
      settings.tempo = top.tempoTarget
      if (!bass) settingEvents.push({ beat: elapsedBeats, kind: 'tempo', value: String(top.tempoTarget) })
    }
  }

  const invalidatePostfix = () => {
    postfixTarget = false
  }

  const applyInheritedSettings = () => {
    while (inheritedEventIndex < inheritedSettingEvents.length) {
      const event = inheritedSettingEvents[inheritedEventIndex]
      if (event.beat - elapsedBeats > 1e-9) break
      if (event.kind === 'key') {
        settings.key = event.value
        accidentalState.clear()
      } else if (event.kind === 'meter') {
        const [beats, beatValue] = event.value.split('/').map(Number)
        settings.meter = { beats, beatValue }
        unit.expected = beats * 4 / beatValue
      } else {
        settings.tempo = Number(event.value)
      }
      inheritedEventIndex += 1
    }
  }

  const rejectPendingSfz = (token: Token) => {
    if (pendingSfz) {
      diagnostics.push(lineMessage(pendingSfz, 'sfz 后方第一个元素必须是有音高的普通音符或和音组'))
      pendingSfz = null
    }
    invalidatePostfix()
    return token
  }

  const absolutePitch = (pitch: ParsedPitch) => {
    const mode = keyMode(settings.key)
    const base = 48 + tonicPitchClass(settings.key) + keyModeIntervals(mode)[pitch.degree - 1]
    const shift = octaveShift(pitch.octave)
    const stateKey = `${pitch.degree}|${shift}`
    let accidental = accidentalState.get(stateKey) ?? 0
    if (pitch.accidental) {
      accidental = pitch.accidental === '='
        ? 0
        : [...pitch.accidental].reduce((sum, char) => sum + (char === '#' ? 1 : -1), 0)
      accidentalState.set(stateKey, accidental)
    }
    return base + accidental + shift * 12 + activeOctaveShift() * 12
  }

  const addLyrics = (count: number) => {
    const volta = activeVolta()
    if (volta?.range) {
      for (const pass of volta.range) unit.voltaLyrics.set(pass, (unit.voltaLyrics.get(pass) ?? 0) + count)
    } else {
      unit.commonLyrics += count
    }
  }

  const addAtom = (token: Token, duration: number, atom: { kind: 'note' | 'rest' | 'harmony' | 'tuplet'; pitches?: number[]; tie?: boolean; lyricCount?: number }) => {
    if (voltaNeedsBar && !activeVolta()) {
      diagnostics.push(lineMessage(token, 'volta 关闭后、下一条小节线前不能出现音符'))
      voltaNeedsBar = false
    }
    if (completedVoltaGroup && !activeVolta()) {
      currentVoltaRepeat = 0
      completedVoltaGroup = false
    }
    firstMusicSeen = true
    unit.hasAtom = true
    for (const paren of parens) paren.atoms += 1
    if (terminalSeen) diagnostics.push(lineMessage(token, '终止线之后不能再出现乐谱正文内容'))
    if (firstPartSeen && !currentPart) diagnostics.push(lineMessage(token, '第一个 part 开始后，音乐内容必须位于 part 内'))
    if (unit.multiRestPendingBar) diagnostics.push(lineMessage(token, '多小节休止必须独占一个小节位置'))
    unit.currentHasAtom = true
    unit.measureLine = unit.currentHasAtom && unit.beats === 0 ? token.line : unit.measureLine
    unit.beats += duration
    elapsedBeats += duration

    const eligible = atom.kind === 'note' || atom.kind === 'harmony'
    if (pendingSfz) {
      if (!eligible) diagnostics.push(lineMessage(pendingSfz, 'sfz 后方第一个元素必须是有音高的普通音符或和音组'))
      pendingSfz = null
    }

    let tiedTarget = false
    if (pendingTie) {
      const sameKind = pendingTie.kind === atom.kind
      const actual = [...(atom.pitches ?? [])].sort((a, b) => a - b)
      const expected = [...pendingTie.pitches].sort((a, b) => a - b)
      const samePitches = actual.length === expected.length && actual.every((pitch, index) => pitch === expected[index])
      if (!sameKind || !samePitches) diagnostics.push(lineMessage(token, '延音目标的类型或绝对音高不匹配'))
      else tiedTarget = true
      pendingTie = null
    }
    if (atom.tie && eligible) pendingTie = { kind: atom.kind as 'note' | 'harmony', pitches: atom.pitches ?? [], line: token.line }
    if (!tiedTarget) addLyrics(isInstrumental() ? 0 : atom.lyricCount ?? (eligible ? 1 : 0))
    postfixTarget = atom.kind === 'note' || atom.kind === 'harmony' ? atom.kind : false
  }

  const handleBar = (token: Token) => {
    voltaNeedsBar = false
    rejectPendingSfz(token)
    if (parens.length > 0) {
      diagnostics.push(lineMessage(token, '圆括号必须在同一小节内闭合'))
      parens.length = 0
    }
    const repeatEnd = token.raw === ':||' || token.raw === ':|||' || token.raw === ':||:'
    commitMeasure(token.line, token.start + token.raw.length, repeatEnd, repeatOpen?.id)
    if (token.raw === '||:') {
      if (repeatOpen) diagnostics.push(lineMessage(token, '反复区域不能嵌套或重叠'))
      repeatOpen = { line: token.line, id: ++repeatId }
      currentVoltaRepeat = repeatOpen.id
    } else if (token.raw === ':||' || token.raw === ':|||' || token.raw === ':||:') {
      if (!repeatOpen) {
        currentVoltaRepeat = currentVoltaRepeat || ++repeatId
      }
      repeatOpen = null
      if (token.raw === ':||:') {
        repeatOpen = { line: token.line, id: ++repeatId }
        currentVoltaRepeat = repeatOpen.id
      }
    }
    nextMeasureRepeatStart = token.raw === '||:' || token.raw === ':||:' ? repeatOpen?.id : undefined
    if (token.raw === '|||' || token.raw === ':|||') {
      terminalCount += 1
      terminalSeen = !fineBeforeTerminal
      if (currentPart) diagnostics.push(lineMessage(token, '具名乐段内不能使用终止线'))
    }
    fineBeforeTerminal = false
    repeatCountTarget = token.raw === ':||' || token.raw === ':|||' || token.raw === ':||:'
  }

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex]
    if (isTrivia(token)) continue

    if (fineBeforeTerminal && token.kind !== 'bar') fineBeforeTerminal = false

    const isRepeatCount = token.kind === 'attribute' && /^x\d+$/.test(token.content ?? '')
    if (!isRepeatCount && token.kind !== 'bar') repeatCountTarget = false

    if (terminalSeen && !isRepeatCount && !terminalTailReported) {
      diagnostics.push(lineMessage(token, '终止线之后只能出现补充块、空白和注释'))
      terminalTailReported = true
    }
    if (firstPartSeen && !currentPart && !(token.kind === 'attribute' && (token.content ?? '').startsWith('part='))) {
      diagnostics.push(lineMessage(token, '第一个 part 开始后，正文顶层只能继续定义 part'))
    }

    if (token.kind === 'bar') {
      if (bass && !['|', '||', '|||'].includes(token.raw)) {
        diagnostics.push(lineMessage(token, '低音谱表内不能使用反复线或反复终止线'))
      }
      handleBar(token)
      continue
    }
    if (token.kind === 'open-paren') {
      rejectPendingSfz(token)
      if (unit.multiRestPendingBar) diagnostics.push(lineMessage(token, '多小节休止不能使用圆括号修饰'))
      parens.push({ line: token.line, atoms: 0 })
      continue
    }
    if (token.kind === 'close-paren') {
      if (pendingSfz) {
        diagnostics.push(lineMessage(pendingSfz, 'sfz 后方第一个元素必须是有音高的普通音符或和音组'))
        pendingSfz = null
      }
      const paren = parens.pop()
      if (!paren) diagnostics.push(lineMessage(token, '多余的右括号'))
      else if (paren.atoms === 0) diagnostics.push(lineMessage(token, '圆括号内至少需要一个音乐原子'))
      continue
    }

    if (token.kind === 'attribute') {
      const content = token.content ?? ''
      if (/^x\d+$/.test(content)) {
        const count = Number(content.slice(1))
        if (!repeatCountTarget) diagnostics.push(lineMessage(token, '反复次数标记必须紧跟后反复线'))
        else if (!Number.isSafeInteger(count) || count < 2) diagnostics.push(lineMessage(token, '反复次数必须是不小于 2 的整数'))
        repeatCountTarget = false
        continue
      }
      repeatCountTarget = false
      const closing = closingBlockName(content)
      if (closing !== undefined) {
        rejectPendingSfz(token)
        closeBlock(token, closing)
        continue
      }

      const equals = content.indexOf('=')
      const name = attributeName(content)
      const value = equals === -1 ? '' : content.slice(equals + 1)
      const isInfo = INFO_FIELDS.has(name)
      const isPostfix = POSTFIX_FLAGS.has(content) || /^(?:ac|ap)\(/.test(content)
      const isTempoRamp = name === 'accel' || name === 'rit'
      const isInterval = INTERVAL_FLAGS.has(content) || name === 'volta' || isTempoRamp
      const isPosition = content === 'br' || name === 'text'
      const isState = DYNAMICS.has(content) || name === 'key' || name === 'chord' || /^\d+qpm$/.test(content)

      if (isPostfix) {
        if (!postfixTarget) diagnostics.push(lineMessage(token, '后置指令必须紧跟有音高的普通音符、和音组或同目标的后置指令'))
        else if (content === 'arp' && postfixTarget !== 'harmony') diagnostics.push(lineMessage(token, '琶音只能附在和音组之后'))
      } else if (content === 'sfz') {
        invalidatePostfix()
        if (pendingSfz) diagnostics.push(lineMessage(token, 'sfz 不能连续叠加'))
        pendingSfz = token
      } else {
        rejectPendingSfz(token)
      }

      if (firstPartSeen && !currentPart && !content.startsWith('part=')) {
        diagnostics.push(lineMessage(token, '第一个 part 开始后，正文顶层只能继续定义 part'))
      }

      if (isInfo) {
        if (bass) diagnostics.push(lineMessage(token, '低音谱表内不能声明乐谱信息'))
        if (firstMusicSeen) diagnostics.push(lineMessage(token, '乐谱信息必须写在第一个音乐原子之前'))
        if (infoSeen.has(name)) diagnostics.push(lineMessage(token, `乐谱信息重复声明：${name}`))
        infoSeen.add(name)
        if (value.length === 0) diagnostics.push(lineMessage(token, `乐谱信息值不能为空：${name}`))
        if (name === 'transpose' && !/^-?\d+$/.test(value)) diagnostics.push(lineMessage(token, 'transpose 必须是整数'))
        continue
      }

      if (name === 'key') {
        if (!KEY_PATTERN.test(value)) diagnostics.push(lineMessage(token, `调号格式非法：${value}`))
        else {
          const changed = settings.key !== value
          settings.key = value
          accidentalState.clear()
          if (!firstPartSeen) commonSettings.key = value
          if (!firstMusicSeen) bodyInitial.key = value
          if (!bass && changed) settingEvents.push({ beat: elapsedBeats, kind: 'key', value })
        }
        if (bass) diagnostics.push(lineMessage(token, '低音谱表内不能声明调号'))
        continue
      }

      if (/^\d+\/\d+$/.test(content)) {
        const [beats, beatValue] = content.split('/').map(Number)
        const valid = Number.isSafeInteger(beats) && beats > 0 && Number.isSafeInteger(beatValue) && beatValue > 0 && Number.isInteger(Math.log2(beatValue))
        if (!valid) diagnostics.push(lineMessage(token, `拍号格式非法：${content}`))
        else {
          if (unit.currentHasAtom || unit.multiRestPendingBar) diagnostics.push(lineMessage(token, '不能在尚未结束的小节中改变拍号'))
          settings.meter = { beats, beatValue }
          unit.expected = beats * 4 / beatValue
          if (!firstPartSeen) commonSettings.meter = { beats, beatValue }
          if (!firstMusicSeen) bodyInitial.meter = { beats, beatValue }
          if (!bass) settingEvents.push({ beat: elapsedBeats, kind: 'meter', value: `${beats}/${beatValue}` })
        }
        if (bass) diagnostics.push(lineMessage(token, '低音谱表内不能声明拍号'))
        continue
      }

      if (/^\d+qpm$/.test(content)) {
        const tempo = Number(content.slice(0, -3))
        if (!Number.isSafeInteger(tempo) || tempo <= 0) diagnostics.push(lineMessage(token, '速度必须是正整数'))
        else {
          const changed = settings.tempo !== tempo
          settings.tempo = tempo
          if (!firstPartSeen) commonSettings.tempo = tempo
          if (!firstMusicSeen) bodyInitial.tempo = tempo
          if (!bass && changed) settingEvents.push({ beat: elapsedBeats, kind: 'tempo', value: String(tempo) })
        }
        if (bass) diagnostics.push(lineMessage(token, '低音谱表内不能声明速度'))
        continue
      }

      if (isTempoRamp) {
        const tempo = Number(value)
        const validTarget = /^\d+$/.test(value) && Number.isSafeInteger(tempo) && tempo > 0
        if (!validTarget) diagnostics.push(lineMessage(token, '渐快或渐慢的目标速度必须是正整数'))
        if (bass) diagnostics.push(lineMessage(token, '低音谱表内不能声明渐快或渐慢'))
        blocks.push({ name, line: token.line, tempoTarget: validTarget ? tempo : undefined })
        continue
      }

      if (/^(?:segno|ds|dc|fine)$/.test(content)) {
        if (bass) diagnostics.push(lineMessage(token, '低音谱表内不能使用反复导航标记'))
        if (content === 'segno') segnoCount += 1
        if (content === 'ds' || content === 'dc') jumpCount += 1
        if (content === 'ds') dsCount += 1
        if (content === 'fine') fineBeforeTerminal = true
        continue
      }

      if (name === 'chord') {
        if (!CHORD_PATTERN.test(value)) diagnostics.push(lineMessage(token, `和弦标记值非法：${value}`))
        if (bass) diagnostics.push(lineMessage(token, '低音谱表内不能使用和弦标记'))
        continue
      }

      if (name === 'parts') {
        if (bass) diagnostics.push(lineMessage(token, '低音谱表内不能使用具名乐段顺序'))
        if (partOrderSeen) diagnostics.push(lineMessage(token, 'parts 只能声明一次'))
        if (firstMusicSeen || firstPartSeen) diagnostics.push(lineMessage(token, 'parts 必须写在第一个 part 或音乐原子之前'))
        partOrderSeen = true
        const names = value.split(/\s+/).filter(Boolean)
        if (names.length === 0) diagnostics.push(lineMessage(token, 'parts 至少需要一个乐段名称'))
        for (const part of names) {
          if (!part || /[\s{}=]/.test(part)) diagnostics.push(lineMessage(token, `乐段名称非法：${part}`))
          referencedParts.push(part)
        }
        continue
      }

      if (name === 'part') {
        if (bass) diagnostics.push(lineMessage(token, '低音谱表内不能定义具名乐段'))
        if (!value || /[\s{}=]/.test(value)) diagnostics.push(lineMessage(token, `乐段名称非法：${value}`))
        startPart(value, token)
        continue
      }

      if (name === 'rest') {
        applyInheritedSettings()
        const count = Number(value)
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(count) || count <= 0) {
          diagnostics.push(lineMessage(token, '多小节休止值必须是正整数'))
          continue
        }
        firstMusicSeen = true
        unit.hasAtom = true
        if (terminalSeen) diagnostics.push(lineMessage(token, '终止线之后不能再出现乐谱正文内容'))
        if (firstPartSeen && !currentPart) diagnostics.push(lineMessage(token, '第一个 part 开始后，音乐内容必须位于 part 内'))
        for (const paren of parens) paren.atoms += 1
        if (parens.length > 0) diagnostics.push(lineMessage(token, '多小节休止不能使用圆括号修饰'))
        if (unit.currentHasAtom || unit.multiRestPendingBar) diagnostics.push(lineMessage(token, '多小节休止必须独占一个小节位置'))
        if (pendingTie) {
          diagnostics.push(lineMessage(token, '延音后方第一个音乐原子必须是同类目标'))
          pendingTie = null
        }
        for (let index = 0; index < count; index += 1) {
          unit.measures.push({ actual: unit.expected, expected: unit.expected, line: token.line, barEnd: -1, number: unit.measures.length + 1, repeatEnd: false, repeatStart: false })
        }
        elapsedBeats += count * unit.expected
        unit.currentHasAtom = true
        unit.multiRestPendingBar = true
        postfixTarget = false
        continue
      }

      if (name === 'volta') {
        if (bass) diagnostics.push(lineMessage(token, '低音谱表内不能使用 volta'))
        const parsed = parseRange(value, 'volta ')
        if (parsed.error) diagnostics.push(lineMessage(token, parsed.error))
        if (blocks.some((block) => block.name === 'volta')) diagnostics.push(lineMessage(token, 'volta 不能嵌套'))
        const group = currentVoltaRepeat || ++repeatId
        currentVoltaRepeat = group
        completedVoltaGroup = false
        const used = voltaRanges.get(group) ?? new Set<number>()
        for (const pass of parsed.values) {
          if (used.has(pass)) diagnostics.push(lineMessage(token, `同一反复结构的 volta 遍次重叠：${pass}`))
          used.add(pass)
        }
        voltaRanges.set(group, used)
        blocks.push({ name: 'volta', line: token.line, range: parsed.values })
        continue
      }

      if (INTERVAL_FLAGS.has(content)) {
        blocks.push({
          name: content,
          line: token.line,
          octaveShift: content === '8va' ? 1 : content === '8vb' ? -1 : undefined,
        })
        continue
      }

      if (/^(?:ac|ap)\(/.test(content)) {
        const grace = parseM3NGrace(content)
        if (!grace) {
          diagnostics.push(lineMessage(token, '装饰音必须使用同层配对的圆括号包裹音高序列'))
          continue
        }

        if (!grace.pitchSource.replace(/\s+/g, '')) diagnostics.push(lineMessage(token, '装饰音内至少需要一个音高'))
        else {
          const sequence = splitPitchSequence(grace.pitchSource)
          if (sequence.error) diagnostics.push(lineMessage(token, `装饰音${sequence.error}`))
          if (sequence.hasRest) diagnostics.push(lineMessage(token, '装饰音内不允许休止符'))
        }
        continue
      }

      if (POSTFIX_FLAGS.has(content) || DYNAMICS.has(content) || content === 'sfz') continue
      if (content === 'br') {
        if (bass) diagnostics.push(lineMessage(token, '低音谱表内不能使用 br'))
        continue
      }
      if (name === 'text') {
        if (value.length === 0) diagnostics.push(lineMessage(token, 'text 的值不能为空'))
        continue
      }

      if (/^\d+qpm$/i.test(content)) diagnostics.push(lineMessage(token, 'qpm 必须使用小写，速度值必须是正整数'))
      else diagnostics.push(lineMessage(token, `未知指令：{${content}}`))
      if (bass && (isState || isPosition || isInterval)) {
        // The specific bass restriction above is more useful when available.
      }
      continue
    }

    if (token.kind === 'note') {
      applyInheritedSettings()
      const match = /^(0|[1-7])([#b=]*)([ed]*)(\^*)(\.*)(~?)$/.exec(token.raw)
      if (!match) {
        rejectPendingSfz(token)
        diagnostics.push(lineMessage(token, `音符或时值后缀格式非法：${token.raw}`))
        continue
      }
      const [, degree, accidental, octave, carets, dots, tie] = match
      if (degree === '0') {
        if (accidental || octave || tie) diagnostics.push(lineMessage(token, '休止符不能使用音高修饰或延音'))
        addAtom(token, durationInBeats(parens.length, carets.length, dots.length), { kind: 'rest', lyricCount: 0 })
      } else {
        const parsed = parsePitch(`${degree}${accidental}${octave}`)
        if (!parsed.pitch) {
          diagnostics.push(lineMessage(token, parsed.error ?? `音高格式非法：${token.raw}`))
          rejectPendingSfz(token)
          continue
        }
        const pitch = absolutePitch(parsed.pitch)
        addAtom(token, durationInBeats(parens.length, carets.length, dots.length), {
          kind: 'note', pitches: [pitch], tie: tie === '~', lyricCount: 1,
        })
      }
      continue
    }

    if (token.kind === 'group') {
      applyInheritedSettings()
      const match = /^\[([^\]]*):([^\]]*)\](\^*)(\.*)(~?)$/.exec(token.raw)
      if (!match) {
        rejectPendingSfz(token)
        diagnostics.push(lineMessage(token, `音符分组格式非法：${token.raw}`))
        continue
      }
      const sequence = splitPitchSequence(match[1])
      const mode = match[2].trim()
      if (sequence.error) diagnostics.push(lineMessage(token, `分组${sequence.error}`))
      const elementCount = sequence.pitches.length + (sequence.hasRest ? (match[1].replace(/\s+/g, '').match(/0/g)?.length ?? 0) : 0)
      if (elementCount < 2) diagnostics.push(lineMessage(token, '音符分组至少需要两个元素'))
      const harmony = mode === 'h'
      const units = Number(mode)
      if (!harmony && (!/^\d+$/.test(mode) || !Number.isSafeInteger(units) || units <= 0)) {
        diagnostics.push(lineMessage(token, `分组模式必须是 h 或正整数：${mode}`))
      }
      if (harmony && sequence.hasRest) diagnostics.push(lineMessage(token, '和音组内不允许休止符'))
      if (!harmony && match[5]) diagnostics.push(lineMessage(token, '连音组整体不能使用延音'))
      const pitches = sequence.pitches.map(absolutePitch)
      const duration = (harmony ? 1 : Number.isFinite(units) && units > 0 ? units : 0)
        * durationInBeats(parens.length, match[3].length, match[4].length)
      addAtom(token, duration, {
        kind: harmony ? 'harmony' : 'tuplet',
        pitches,
        tie: harmony && match[5] === '~',
        lyricCount: harmony ? 1 : sequence.pitches.length,
      })
      continue
    }

    rejectPendingSfz(token)
    diagnostics.push(lineMessage(token, `无法识别的语法：${token.raw}`))
  }

  if (pendingSfz) diagnostics.push(lineMessage(pendingSfz, 'sfz 后缺少目标音符或和音组'))
  if (parens.length > 0) {
    for (const paren of parens) diagnostics.push(`第 ${paren.line} 行：圆括号未闭合`)
  }
  for (const block of blocks) diagnostics.push(`第 ${block.line} 行：未闭合的区间块：{${block.name}}`)
  if (currentPart) finishUnit()
  else if (unit.hasAtom || unit.measures.length > 0) finishUnit()
  else finishRepeat()

  if (!bass) {
    if (segnoCount > 1) diagnostics.push('segno 最多只能使用一次')
    if (jumpCount > 1) diagnostics.push('ds 和 dc 总共最多只能使用一次')
    if (dsCount > 0 && segnoCount !== 1) diagnostics.push('ds 必须配合唯一的 segno')
    if (firstPartSeen && !partOrderSeen) diagnostics.push('使用 part 时必须声明 parts 演奏顺序')
    for (const part of definedParts) {
      if (!referencedParts.includes(part)) diagnostics.push(`乐段定义未被引用：${part}`)
    }
    for (const part of referencedParts) {
      if (!definedParts.has(part)) diagnostics.push(`乐段引用未定义：${part}`)
    }
    if (!firstPartSeen && terminalCount !== 1) diagnostics.push(`未分段正文必须且只能使用一次终止线，实际 ${terminalCount} 次`)
    if (firstPartSeen && terminalCount > 0) diagnostics.push('具名乐段内不得使用终止线')
  }

  const orderedUnits = firstPartSeen
    ? referencedParts.flatMap((part) => unitsByPart.get(part) ? [unitsByPart.get(part)!] : [])
    : completedUnits
  const firstPlaybackUnits = firstPartSeen
    ? referencedParts.filter((part, index) => referencedParts.indexOf(part) === index)
      .flatMap((part) => unitsByPart.get(part) ? [unitsByPart.get(part)!] : [])
    : completedUnits
  const lyricCount = (pass: number) => orderedUnits.reduce(
    (sum, item) => sum + item.commonLyrics + (item.voltaLyrics.get(pass) ?? 0),
    0,
  )
  const firstPlaybackLyricCount = (pass: number) => firstPlaybackUnits.reduce(
    (sum, item) => sum + item.commonLyrics + (item.voltaLyrics.get(pass) ?? 0),
    0,
  )
  const lyricPasses = new Set<number>([1])
  for (const ranges of voltaRanges.values()) {
    for (const pass of ranges) lyricPasses.add(pass)
  }
  return {
    measures: orderedUnits.flatMap((item) => item.measures),
    lyricCount,
    firstPlaybackLyricCount,
    lyricPasses,
    hasParts: firstPartSeen,
    ended: firstPartSeen ? !currentPart && definedParts.size > 0 : terminalCount === 1,
    initial: bodyInitial,
    settingEvents,
  }
}

function lyricItems(tokens: Token[], mode: LyricMode) {
  const source = tokens
    .filter((token) => token.kind !== 'comment')
    .map((token) => token.raw)
    .join('')
    .trim()
  if (!source) return { count: 0, forcedTiedTargets: 0, hasTab: false, hasEmptyForcedTarget: false }
  const items = parseLyricItems(source, 0, mode)
  return {
    count: items.length,
    forcedTiedTargets: items.filter((item) => item.forceTiedTarget).length,
    hasTab: /\t/.test(source),
    hasEmptyForcedTarget: /\+(?=\s|$)/.test(source),
  }
}

export function invalidMeasureBarEnds(source: string) {
  const diagnostics: string[] = []
  const invalidBarEnds = new Set<number>()
  const { main, supplements } = extractSupplements(tokenizeM3N(source), diagnostics)
  const mainResult = validateBody(main, diagnostics, { invalidBarEnds })
  const bassBlock = supplements.find((block) => block.kind === 'bass')
  if (bassBlock) {
    validateBody(bassBlock.tokens, diagnostics, {
      bass: true,
      initial: mainResult.initial,
      inheritedSettingEvents: mainResult.settingEvents,
      invalidBarEnds,
    })
  }
  return [...invalidBarEnds].sort((left, right) => left - right)
}

export function invalidMeasureIds(source: string) {
  const invalidEnds = new Set(invalidMeasureBarEnds(source))
  const document = parseM3NDocument(source)
  const renderedMeasureCount = (measures: Array<{ events: unknown[]; multiRest?: number }>) => {
    let count = measures.length
    while (count > 1 && measures[count - 1]?.events.length === 0 && !measures[count - 1]?.multiRest) count -= 1
    return count
  }

  return [...document.parts.values()].flatMap((part, partIndex) => {
    const measureCount = Math.max(renderedMeasureCount(part.melody), renderedMeasureCount(part.bass))
    return Array.from({ length: measureCount }, (_, measureIndex) => {
      const melody = part.melody[measureIndex]
      const bass = part.bass[measureIndex]
      return invalidEnds.has(melody?.barEnd ?? -1) || invalidEnds.has(bass?.barEnd ?? -1)
        ? `m3n-measure-${partIndex + 1}-${measureIndex + 1}`
        : null
    }).filter((id): id is string => id !== null)
  })
}

export function validateM3N(source: string, options: { skipBeatValidation?: boolean } = {}): string[] {
  const diagnostics: string[] = []
  const tokens = tokenizeM3N(source)
  const { main, supplements } = extractSupplements(tokens, diagnostics)
  const mainResult = validateBody(main, diagnostics, { skipBeatValidation: options.skipBeatValidation })

  const lyrics = supplements.filter((block) => block.kind === 'lyrics')
  const bassBlocks = supplements.filter((block) => block.kind === 'bass')
  if (bassBlocks.length > 1) diagnostics.push('每份文档最多包含一个低音谱表块')
  if (bassBlocks.length > 0 && mainResult.hasParts) diagnostics.push('低音谱表不能与具名乐段组合')

  const lyricPasses = new Set<number>()
  if (lyrics.length > 1 && lyrics.some((block) => block.range === null)) {
    diagnostics.push('存在多个歌词块时，每个歌词块都必须指定遍次')
  }
  for (const [index, lyric] of lyrics.entries()) {
    const items = lyricItems(lyric.tokens, lyric.lyricMode ?? 'char')
    if (items.count === 0) diagnostics.push(`第 ${lyric.line} 行：歌词块为空`)
    if (items.hasTab) diagnostics.push(`第 ${lyric.line} 行：歌词项必须使用半角空格或换行分隔，不能使用 Tab`)
    if (items.hasEmptyForcedTarget) diagnostics.push(`第 ${lyric.line} 行：+ 后必须跟随歌词项`)
    const parsed = lyric.range === null
      ? { values: mainResult.lyricPasses, error: null }
      : parseRange(lyric.range, '歌词 ')
    if (parsed.error) diagnostics.push(`第 ${lyric.line} 行：${parsed.error}`)
    for (const pass of parsed.values) {
      if (lyricPasses.has(pass)) diagnostics.push(`第 ${lyric.line} 行：歌词块遍次重叠：${pass}`)
      lyricPasses.add(pass)
      const expected = (mainResult.hasParts ? mainResult.firstPlaybackLyricCount(pass) : mainResult.lyricCount(pass)) + items.forcedTiedTargets
      const exceedsAvailablePositions = index > 0 && items.count > expected
      const firstBlockIsIncomplete = index === 0 && items.count !== expected
      if (mainResult.lyricPasses.size === 1 && (firstBlockIsIncomplete || exceedsAvailablePositions)) {
        diagnostics.push(`第 ${lyric.line} 行：歌词对位数量不匹配：第 ${pass} 遍需要 ${expected} 项，实际 ${items.count} 项`)
      }
    }
  }

  const bassBlock = bassBlocks[0]
  if (bassBlock) {
    const hasContent = bassBlock.tokens.some((token) => !isTrivia(token))
    if (!hasContent) diagnostics.push(`第 ${bassBlock.line} 行：低音谱表内容为空`)
    const bassResult = validateBody(bassBlock.tokens, diagnostics, {
      bass: true,
      initial: mainResult.initial,
      inheritedSettingEvents: mainResult.settingEvents,
    })
    if (bassResult.measures.length !== mainResult.measures.length) {
      diagnostics.push(`双谱表小节数量不一致：正文 ${mainResult.measures.length} 小节，低音 ${bassResult.measures.length} 小节`)
    } else {
      for (let index = 0; index < mainResult.measures.length; index += 1) {
        const melody = mainResult.measures[index]
        const bassMeasure = bassResult.measures[index]
        if (Math.abs(melody.actual - bassMeasure.actual) > 1e-9) {
          diagnostics.push(`双谱表第 ${index + 1} 小节时值不一致：正文 ${melody.actual} 拍，低音 ${bassMeasure.actual} 拍`)
        }
      }
    }
  }

  if (supplements.length > 0 && !mainResult.ended) diagnostics.push('补充块只能写在完整乐谱正文之后')
  return [...new Set(diagnostics)]
}

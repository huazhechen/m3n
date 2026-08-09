import { durationInBeats } from './notation/m3n-primitives.js' 
import { parseM3NGrace } from './notation/m3n-groups.js'
import { parseLyricItems } from './notation/lyrics.js'
import { tokenizeM3N, type M3NToken as Token } from './notation/m3n-tokens.js'
import { createScoreDiagnostic, type ScoreDiagnostic } from './notation/diagnostics.js'
import { parseM3NDocument } from './m3n-direct.js'
import { hasForcedLyricOutsideTiedTarget } from './m3n-lyric-alignment.js'
import { projectM3NDocument, type M3NDocumentProjection, type M3NDocumentStructure, type M3NPhrase } from './notation/m3n-document.js'
import { measurePlaybackPasses, parsePassRange } from './notation/repeats.js'
import { m3nChord } from './m3n-harmony.js'
import type { ScoreDocument } from './notation/score-document.js'
import { validateScoreDocument } from './notation/score-rules.js'
import { validateM3NSyntaxTree } from './notation/syntax-rules.js'
import { parseM3NSyntaxTree, type M3NSyntaxTree } from './notation/syntax-tree.js'

type Meter = { beats: number; beatValue: number }
type Settings = { key: string; meter: Meter; tempo: number | null }

type Unit = {
  expected: number
  currentHasAtom: boolean
  multiRestPendingBar: boolean
}

type ParsedPitch = {
  degree: number
  accidental: string
  octave: string
}

type SettingEvent = {
  beat: number
  kind: 'key' | 'meter' | 'tempo'
  value: string
}

type Block = {
  name: string
  line: number
  tempoTarget?: number
}

const INFO_FIELDS = new Set([
  'title', 'subtitle', 'singer', 'composer', 'lyricist', 'arranger',
  'copyright', 'source', 'note', 'transpose',
])

const INTERVAL_FLAGS = new Set(['cresc', 'decres', 'dim', 'lg', '8va', '8vb', 'inst'])
const DYNAMICS = new Set(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'])
const POSTFIX_FLAGS = new Set([
  'arp', 'tr', 'str', 'brk', 'tip', 'hold', 'fermata', 'breath', 'f1', 'f2', 'f3', 'f4', 'f5',
])

const KEY_PATTERN = /^([A-G](?:#|b)?)(dor|phr|lyd|mix|m|loc)?$/
const CHORD_PATTERN = /^(I|II|III|IV|V|VI|VII|i|ii|iii|iv|v|vi|vii)(?:m|dim|aug|sus2|sus4|[2-9]|1[0-3])?$/

function lineMessage(token: Token, message: string) {
  const content = token.content ?? token.raw
  const name = attributeName(content)
  const code = token.kind === 'bar' ? 'M3N_SOURCE_REPEAT'
    : token.kind === 'note' || token.kind === 'group' ? 'M3N_SOURCE_PITCH'
      : token.kind === 'open-paren' || token.kind === 'close-paren' ? 'M3N_SOURCE_GROUPING'
        : token.kind !== 'attribute' ? 'M3N_SOURCE_SYNTAX'
          : INFO_FIELDS.has(name) ? 'M3N_SOURCE_METADATA'
            : name === 'key' ? 'M3N_SOURCE_KEY'
              : /^\d+\/\d+$/.test(content) ? 'M3N_SOURCE_METER'
                : /^\d+qpm$/i.test(content) || name === 'accel' || name === 'rit' ? 'M3N_SOURCE_TEMPO'
                  : /^(?:segno|ds|dc|fine)$/.test(content) ? 'M3N_SOURCE_REPEAT'
                    : name === 'chord' || content === 'arp' ? 'M3N_SOURCE_HARMONY'
                      : /^(?:ac|ap)\(/.test(content) ? 'M3N_SOURCE_GRACE'
                        : name === 'rest' ? 'M3N_SOURCE_MULTI_REST'
                          : 'M3N_SOURCE_DIRECTIVE'
  return createScoreDiagnostic({ code, message: `第 ${token.line} 行：${message}`, range: { start: token.start, end: token.end } })
}

function sourceDiagnostic(code: string, message: string, range?: { start: number; end: number }, severity: 'error' | 'warning' = 'error') {
  return createScoreDiagnostic({ code, message, range, severity })
}

function phraseDiagnostic(code: string, message: string, row: { start: number; text: string }, severity: 'error' | 'warning' = 'error') {
  return sourceDiagnostic(code, message, { start: row.start, end: row.start + row.text.length }, severity)
}

function isTrivia(token: Token) {
  return token.kind === 'space' || token.kind === 'comment'
}

function attributeName(content: string) {
  const equals = content.indexOf('=')
  return equals === -1 ? content : content.slice(0, equals)
}

function closingBlockName(content: string) {
  if (content === '/') return null
  return content.startsWith('/') ? content.slice(1) : undefined
}

function parsePitch(raw: string): { pitch: ParsedPitch | null; error: string | null } {
  const match = /^([1-7])([#b=]*)([ed]*)$/.exec(raw)
  if (!match) return { pitch: null, error: `音高格式非法：${raw}` }
  const accidental = match[2] ?? ''
  const octave = match[3] ?? ''
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

function splitPitchSequence(source: string, allowTerminalTie = false): { pitches: ParsedPitch[]; hasRest: boolean; firstPitch?: ParsedPitch; hasTerminalTie: boolean; terminalTieOnRest: boolean; error: string | null } {
  const normalized = source.replace(/\s+/g, '')
  const hasTerminalTie = allowTerminalTie && normalized.endsWith('~')
  const pitchSource = hasTerminalTie ? normalized.slice(0, -1) : normalized
  const pitches: ParsedPitch[] = []
  let hasRest = false
  let index = 0
  while (index < pitchSource.length) {
    if (pitchSource[index] === '0') {
      hasRest = true
      index += 1
      continue
    }
    const token = /^[1-7][#b=]*[ed]*/.exec(pitchSource.slice(index))?.[0]
    if (!token) return { pitches, hasRest, hasTerminalTie, terminalTieOnRest: false, error: `元素序列含非法内容：${source}` }
    const parsed = parsePitch(token)
    if (!parsed.pitch) return { pitches, hasRest, hasTerminalTie, terminalTieOnRest: false, error: parsed.error }
    pitches.push(parsed.pitch)
    index += token.length
  }
  return {
    pitches,
    hasRest,
    firstPitch: pitchSource.startsWith('0') ? undefined : pitches[0],
    hasTerminalTie,
    terminalTieOnRest: hasTerminalTie && pitchSource.endsWith('0'),
    error: null,
  }
}

function createUnit(meter: Meter): Unit {
  return {
    expected: meter.beats * 4 / meter.beatValue,
    currentHasAtom: false,
    multiRestPendingBar: false,
  }
}

function validateBody(
  tokens: Token[],
  diagnostics: ScoreDiagnostic[],
  options: { bass?: boolean; initial?: Settings; inheritedSettingEvents?: SettingEvent[]; requireTerminal?: boolean } = {},
) {
  const bass = options.bass ?? false
  const defaultSettings: Settings = options.initial
    ? structuredClone(options.initial)
    : { key: 'C', meter: { beats: 4, beatValue: 4 }, tempo: null }
  let settings = structuredClone(defaultSettings)
  const unit = createUnit(settings.meter)
  const blocks: Block[] = []
  const parens: Array<{ line: number; atoms: number }> = []
  const infoSeen = new Set<string>()
  let firstMusicSeen = false
  let terminalCount = 0
  let fineBeforeTerminal = false
  let postfixTarget: 'note' | 'harmony' | false = false
  let pendingSfz: Token | null = null
  let repeatOpen: { line: number } | null = null
  let repeatCountTarget = false
  let segnoCount = 0
  let jumpCount = 0
  let dsCount = 0
  let bodyInitial = structuredClone(defaultSettings)
  let elapsedBeats = 0
  let inheritedEventIndex = 0
  const settingEvents: SettingEvent[] = []
  const inheritedSettingEvents = options.inheritedSettingEvents ?? []

  const commitMeasure = () => {
    unit.currentHasAtom = false
    unit.multiRestPendingBar = false
  }

  const finishRepeat = () => {
    if (repeatOpen) diagnostics.push(sourceDiagnostic('M3N_SOURCE_REPEAT', `第 ${repeatOpen.line} 行：前反复线无对应后反复线`))
    repeatOpen = null
  }

  const closeBlock = (named: string | null) => {
    const top = blocks.at(-1)
    if (!top || (named !== null && named !== top.name)) return
    blocks.pop()
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
      if (!event) break
      if (event.beat - elapsedBeats > 1e-9) break
      if (event.kind === 'key') {
        settings.key = event.value
      } else if (event.kind === 'meter') {
        const [beats = 0, beatValue = 0] = event.value.split('/').map(Number)
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

  const addAtom = (token: Token, duration: number, atom: { kind: 'note' | 'rest' | 'harmony' | 'tuplet' }) => {
    firstMusicSeen = true
    for (const paren of parens) paren.atoms += 1
    if (unit.multiRestPendingBar) diagnostics.push(lineMessage(token, '多小节休止必须独占一个小节位置'))
    unit.currentHasAtom = true
    elapsedBeats += duration

    const eligible = atom.kind === 'note' || atom.kind === 'harmony'
    if (pendingSfz) {
      if (!eligible) diagnostics.push(lineMessage(pendingSfz, 'sfz 后方第一个元素必须是有音高的普通音符或和音组'))
      pendingSfz = null
    }

    postfixTarget = atom.kind === 'note' || atom.kind === 'harmony' ? atom.kind : false
  }

  const handleBar = (token: Token) => {
    rejectPendingSfz(token)
    if (parens.length > 0) {
      diagnostics.push(lineMessage(token, '圆括号必须在同一小节内闭合'))
      parens.length = 0
    }
    commitMeasure()
    if (token.raw === '||:') {
      if (repeatOpen) diagnostics.push(lineMessage(token, '反复区域不能嵌套或重叠'))
      repeatOpen = { line: token.line }
    } else if (token.raw === ':||' || token.raw === ':|||' || token.raw === ':||:') {
      repeatOpen = null
      if (token.raw === ':||:') {
        repeatOpen = { line: token.line }
      }
    }
    if (token.raw === '|||' || token.raw === ':|||') {
      terminalCount += 1
    }
    fineBeforeTerminal = false
    repeatCountTarget = token.raw === ':||' || token.raw === ':|||' || token.raw === ':||:'
  }

  for (const token of tokens) {
    if (isTrivia(token)) continue

    if (fineBeforeTerminal && token.kind !== 'bar') fineBeforeTerminal = false

    const isRepeatCount = token.kind === 'attribute' && /^x\d+$/.test(token.content ?? '')
    if (!isRepeatCount && token.kind !== 'bar') repeatCountTarget = false


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
        closeBlock(closing)
        continue
      }

      const equals = content.indexOf('=')
      const name = attributeName(content)
      const value = equals === -1 ? '' : content.slice(equals + 1)
      const isInfo = INFO_FIELDS.has(name)
      const isPostfix = POSTFIX_FLAGS.has(content) || /^(?:ac|ap)\(/.test(content)
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
          if (!firstMusicSeen) bodyInitial.key = value
          if (!bass && changed) settingEvents.push({ beat: elapsedBeats, kind: 'key', value })
        }
        if (bass) diagnostics.push(lineMessage(token, '低音谱表内不能声明调号'))
        continue
      }

      if (/^\d+\/\d+$/.test(content)) {
        const [beats = 0, beatValue = 0] = content.split('/').map(Number)
        const valid = Number.isSafeInteger(beats) && beats > 0 && Number.isSafeInteger(beatValue) && beatValue > 0 && Number.isInteger(Math.log2(beatValue))
        if (!valid) diagnostics.push(lineMessage(token, `拍号格式非法：${content}`))
        else {
          if (unit.currentHasAtom || unit.multiRestPendingBar) diagnostics.push(lineMessage(token, '不能在尚未结束的小节中改变拍号'))
          settings.meter = { beats, beatValue }
          unit.expected = beats * 4 / beatValue
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
          if (!firstMusicSeen) bodyInitial.tempo = tempo
          if (!bass && changed) settingEvents.push({ beat: elapsedBeats, kind: 'tempo', value: String(tempo) })
        }
        if (bass) diagnostics.push(lineMessage(token, '低音谱表内不能声明速度'))
        continue
      }

      if (name === 'accel' || name === 'rit') {
        const tempo = Number(value)
        const validTarget = /^\d+$/.test(value) && Number.isSafeInteger(tempo) && tempo > 0
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

      if (name === 'rest') {
        applyInheritedSettings()
        const count = Number(value)
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(count) || count <= 0) {
          diagnostics.push(lineMessage(token, '多小节休止值必须是正整数'))
          continue
        }
        firstMusicSeen = true
        for (const paren of parens) paren.atoms += 1
        if (parens.length > 0) diagnostics.push(lineMessage(token, '多小节休止不能使用圆括号修饰'))
        if (unit.currentHasAtom || unit.multiRestPendingBar) diagnostics.push(lineMessage(token, '多小节休止必须独占一个小节位置'))
        elapsedBeats += count * unit.expected
        unit.currentHasAtom = true
        unit.multiRestPendingBar = true
        postfixTarget = false
        continue
      }

      if (INTERVAL_FLAGS.has(name)) {
        if (value && !((name === 'cresc' || name === 'decres' || name === 'dim') && value === 'text')) {
          diagnostics.push(lineMessage(token, `区间指令 {${name}} 不支持参数：${value}`))
          continue
        }
        blocks.push({
          name: name === 'dim' ? 'decres' : name,
          line: token.line,
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
      const [, degree = '', accidental = '', octave = '', carets = '', dots = '', tie = ''] = match
      if (degree === '0') {
        if (accidental || octave || tie) diagnostics.push(lineMessage(token, '休止符不能使用音高修饰或延音'))
        addAtom(token, durationInBeats(parens.length, carets.length, dots.length), { kind: 'rest' })
      } else {
        const parsed = parsePitch(`${degree}${accidental}${octave}`)
        if (!parsed.pitch) {
          diagnostics.push(lineMessage(token, parsed.error ?? `音高格式非法：${token.raw}`))
          rejectPendingSfz(token)
          continue
        }
        addAtom(token, durationInBeats(parens.length, carets.length, dots.length), {
          kind: 'note',
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
      const pitchSource = match[1] ?? ''
      const mode = (match[2] ?? '').trim()
      const harmony = mode === 'h'
      const sequence = splitPitchSequence(pitchSource, !harmony)
      if (sequence.error) diagnostics.push(lineMessage(token, `分组${sequence.error}`))
      const elementCount = sequence.pitches.length + (sequence.hasRest ? (pitchSource.replace(/\s+/g, '').match(/0/g)?.length ?? 0) : 0)
      if (elementCount < 2) diagnostics.push(lineMessage(token, '音符分组至少需要两个元素'))
      const units = Number(mode)
      if (!harmony && (!/^\d+$/.test(mode) || !Number.isSafeInteger(units) || units <= 0)) {
        diagnostics.push(lineMessage(token, `分组模式必须是 h 或正整数：${mode}`))
      }
      if (harmony && sequence.hasRest) diagnostics.push(lineMessage(token, '和音组内不允许休止符'))
      if (!harmony && match[5]) diagnostics.push(lineMessage(token, '连音组整体不能使用延音'))
      if (!harmony && sequence.terminalTieOnRest) diagnostics.push(lineMessage(token, '连音组内的延音只能附在最后一个有音高的元素上'))
      const duration = (harmony ? 1 : Number.isFinite(units) && units > 0 ? units : 0)
        * durationInBeats(parens.length, (match[3] ?? '').length, (match[4] ?? '').length)
      addAtom(token, duration, {
        kind: harmony ? 'harmony' : 'tuplet',
      })
      continue
    }

    rejectPendingSfz(token)
    diagnostics.push(lineMessage(token, `无法识别的语法：${token.raw}`))
  }

  if (pendingSfz) diagnostics.push(lineMessage(pendingSfz, 'sfz 后缺少目标音符或和音组'))
  if (parens.length > 0) {
    for (const paren of parens) diagnostics.push(sourceDiagnostic('M3N_SOURCE_GROUPING', `第 ${paren.line} 行：圆括号未闭合`))
  }
  finishRepeat()

  if (!bass) {
    if (segnoCount > 1) diagnostics.push(sourceDiagnostic('M3N_SOURCE_REPEAT', 'segno 最多只能使用一次'))
    if (jumpCount > 1) diagnostics.push(sourceDiagnostic('M3N_SOURCE_REPEAT', 'ds 和 dc 总共最多只能使用一次'))
    if (dsCount > 0 && segnoCount !== 1) diagnostics.push(sourceDiagnostic('M3N_SOURCE_REPEAT', 'ds 必须配合唯一的 segno'))
    if (options.requireTerminal !== false && terminalCount !== 1) diagnostics.push(sourceDiagnostic('M3N_SOURCE_REPEAT', `未分段正文必须且只能使用一次终止线，实际 ${terminalCount} 次`))
  }

  return {
    initial: bodyInitial,
    settingEvents,
  }
}

type StrictLyricTarget = { tied: boolean }
type StrictLyricMeasureTargets = StrictLyricTarget[][]

type LyricMeasure = { text: string; start: number }

function lyricMeasures(text: string, start: number): LyricMeasure[] | null {
  if (!text.includes('|')) return null
  const measures: LyricMeasure[] = []
  let measureStart = 0
  for (let index = 0; index <= text.length; index += 1) {
    if (index < text.length && text[index] !== '|') continue
    const raw = text.slice(measureStart, index)
    const leading = raw.length - raw.trimStart().length
    measures.push({ text: raw.trim(), start: start + measureStart + leading })
    measureStart = index + 1
  }
  return measures
}

function validateLyricMeasureAlignment(
  diagnostics: ScoreDiagnostic[],
  phrase: M3NPhrase,
  pass: number,
  lyric: { text: string; start: number },
  measureTargets: StrictLyricMeasureTargets,
) {
  const parsedMeasures = lyricMeasures(lyric.text, lyric.start)
  if (!parsedMeasures) {
    const items = parseLyricItems(lyric.text, lyric.start)
    const passTargets = measureTargets.flat()
    const expected = passTargets.filter((target) => !target.tied).length + items.filter((item) => item.forceTiedTarget).length
    if (items.length !== expected) diagnostics.push(phraseDiagnostic('M3N_LYRIC_ALIGNMENT', `第 ${phrase.line} 行：歌词对位数量不匹配：乐句第 ${pass} 遍需要 ${expected} 项，实际 ${items.length} 项`, lyric, 'warning'))
    if (hasForcedLyricOutsideTiedTarget(items, passTargets)) diagnostics.push(phraseDiagnostic('M3N_LYRIC_ALIGNMENT', `第 ${phrase.line} 行：乐句第 ${pass} 遍的 +歌词项不位于延音目标`, lyric, 'warning'))
    return
  }
  // A terminal lyric bar may either close the row or represent a final empty
  // melody measure. It is decorative only when it would create an extra one.
  const measures = parsedMeasures.length > measureTargets.length && parsedMeasures.at(-1)?.text === ''
    ? parsedMeasures.slice(0, -1)
    : parsedMeasures
  if (measures.length !== measureTargets.length) {
    diagnostics.push(phraseDiagnostic('M3N_LYRIC_ALIGNMENT', `第 ${phrase.line} 行：乐句第 ${pass} 遍需要 ${measureTargets.length} 个歌词小节，实际 ${measures.length} 个`, lyric, 'warning'))
  }
  for (let index = 0; index < Math.max(measures.length, measureTargets.length); index += 1) {
    const measure = measures[index] ?? { text: '', start: lyric.start + lyric.text.length }
    const targets = measureTargets[index] ?? []
    const items = parseLyricItems(measure.text, measure.start)
    const expected = targets.filter((target) => !target.tied).length + items.filter((item) => item.forceTiedTarget).length
    if (items.length !== expected) diagnostics.push(phraseDiagnostic('M3N_LYRIC_ALIGNMENT', `第 ${phrase.line} 行：歌词第 ${index + 1} 小节对位数量不匹配：乐句第 ${pass} 遍需要 ${expected} 项，实际 ${items.length} 项`, lyric, 'warning'))
    if (hasForcedLyricOutsideTiedTarget(items, targets)) diagnostics.push(phraseDiagnostic('M3N_LYRIC_ALIGNMENT', `第 ${phrase.line} 行：乐句第 ${pass} 遍歌词第 ${index + 1} 小节的 +歌词项不位于延音目标`, lyric, 'warning'))
  }
}

export function phraseLyricTargets(document: ScoreDocument, structure: M3NDocumentStructure, sectionName: string, phrase: M3NPhrase) {
  const part = document.parts.get('score')
  if (!part || !phrase.melody) return new Map<number, StrictLyricMeasureTargets>()
  const start = phrase.melody.start
  const end = start + phrase.melody.text.length
  const passesByMeasure = measurePlaybackPasses(part.melody)
  const targets = new Map<number, StrictLyricMeasureTargets>()
  let previousTied = false
  for (const measure of part.melody) {
    const passes = passesByMeasure.get(measure) ?? new Set([1])
    const belongsToPhrase = measure.events.some((event) => start <= event.sourceStart && event.sourceStart < end)
    const measureTargets = new Map<number, StrictLyricTarget[]>()
    if (belongsToPhrase) {
      for (const pass of passes) measureTargets.set(pass, [])
    }
    for (const event of measure.events) {
      const tied = previousTied
      previousTied = event.tie
      if (event.sourceStart < start || event.sourceStart >= end || event.kind === 'rest') continue
      const instrumental = document.intervals.some((interval) => interval.kind === 'inst' && interval.staff === 'melody' &&
        interval.start !== undefined && interval.end !== undefined && interval.start <= event.sourceStart && event.sourceEnd <= interval.end)
      if (instrumental) continue
      const count = event.kind === 'tuplet' ? event.pitches.filter((pitch) => pitch !== '0').length : 1
      for (const pass of passes) {
        const passTargets = measureTargets.get(pass) ?? []
        for (let index = 0; index < count; index += 1) passTargets.push({ tied: tied && index === 0 })
        measureTargets.set(pass, passTargets)
      }
    }
    for (const [pass, currentTargets] of measureTargets) {
      const passMeasures = targets.get(pass) ?? []
      passMeasures.push(currentTargets)
      targets.set(pass, passMeasures)
    }
  }
  const section = structure.sections.find((candidate) => candidate.name === sectionName)
  const phraseIndex = section?.phrases.indexOf(phrase) ?? -1
  const contiguousHouses = (phrases: readonly M3NPhrase[]) => {
    if (!phrases[0]?.passes) return []
    const firstOrdinary = phrases.findIndex((candidate) => !candidate.passes)
    return firstOrdinary < 0 ? phrases : phrases.slice(0, firstOrdinary)
  }
  const precedingHouses = phrase.passes || !section || phraseIndex < 0
    ? []
    : contiguousHouses(section.phrases.slice(0, phraseIndex).reverse())
  const followingHouses = phrase.passes || !section || phraseIndex < 0 || precedingHouses.length > 0
    ? []
    : (() => {
      const following = section.phrases.slice(phraseIndex + 1)
      const firstHouse = following.findIndex((candidate) => Boolean(candidate.passes))
      return firstHouse < 0 ? [] : contiguousHouses(following.slice(firstHouse))
    })()
  const adjacentHouses = precedingHouses.length > 0 ? precedingHouses : followingHouses
  const housePassLimit = adjacentHouses.length === 0
    ? undefined
    : Math.max(...adjacentHouses.flatMap((candidate) => [...parsePassRange(candidate.passes)]))

  if (phrase.passes) {
    const fallbackTargets = targets.values().next().value ?? []
    return new Map([...parsePassRange(phrase.passes)]
      .sort((left, right) => left - right)
      .map((pass) => [pass, targets.get(pass) ?? fallbackTargets]))
  }

  // Playback passes are global so D.S. and alternate endings can share one
  // state machine. Lyric labels are deliberately local to a phrase.
  const localTargets = new Map(
    [...targets.entries()]
      .filter(([pass]) => housePassLimit === undefined || pass <= housePassLimit)
      .sort(([left], [right]) => left - right)
      .map(([, measureTargets], index) => [index + 1, measureTargets]),
  )
  return localTargets
}

function validatePhrasePlaybackPasses(document: ScoreDocument, structure: M3NDocumentStructure) {
  const diagnostics: ScoreDiagnostic[] = []
  const part = document.parts.get('score')
  if (!part) return diagnostics
  const passesByMeasure = measurePlaybackPasses(part.melody)

  for (const section of structure.sections) {
    for (const phrase of section.phrases) {
      if (!phrase.melody) continue
      const start = phrase.melody.start
      const end = start + phrase.melody.text.length
      const measures = part.melody
        .filter((measure) => measure.events.some((event) => start <= event.sourceStart && event.sourceStart < end))
      const firstPasses = [...(measures[0] ? passesByMeasure.get(measures[0]) ?? new Set([1]) : new Set([1]))].join(',')
      const mismatch = measures.findIndex((measure) => [...(passesByMeasure.get(measure) ?? new Set([1]))].join(',') !== firstPasses)
      const mismatchedMeasure = measures[mismatch]
      if (mismatchedMeasure && mismatch > 0) {
        diagnostics.push(phraseDiagnostic('M3N_PHRASE_PLAYBACK', `第 ${phrase.melody.line} 行，第 ${part.melody.indexOf(mismatchedMeasure) + 1} 小节：同一乐句内的小节演奏次数必须一致`, phrase.melody))
      }
    }
  }
  return diagnostics
}

function validatePhraseSpans(document: ScoreDocument, structure: M3NDocumentStructure) {
  const diagnostics: ScoreDiagnostic[] = []
  const phrases = structure.sections.flatMap((section) => section.phrases
    .filter((phrase): phrase is M3NPhrase & { melody: NonNullable<M3NPhrase['melody']> } => Boolean(phrase.melody)))
  const phraseAt = (position: number) => phrases.findIndex((phrase) => (
    phrase.melody.start <= position && position <= phrase.melody.start + phrase.melody.text.length
  ))
  for (const [index, phrase] of phrases.entries()) {
    const end = phrase.melody.start + phrase.melody.text.length
    const events = [...document.parts.values()].flatMap((part) => part.melody.flatMap((measure) => measure.events))
      .filter((event) => phrase.melody.start <= event.sourceStart && event.sourceStart < end)
    if (events.at(-1)?.tie && (phrase.passes || phrases[index + 1]?.passes)) {
      diagnostics.push(phraseDiagnostic('M3N_PHRASE_SPAN', `第 ${phrase.melody.line} 行：延音不能跨越跳房子边界`, phrase.melody))
    }
  }

  for (const interval of document.intervals) {
    if (interval.staff !== 'melody' || interval.kind !== 'lg' || interval.start === undefined || interval.end === undefined) continue
    const startPhrase = phraseAt(interval.start)
    const endPhrase = phraseAt(interval.end)
    if (startPhrase >= 0 && endPhrase > startPhrase && Array.from(
      { length: endPhrase - startPhrase },
      (_, offset) => [phrases[startPhrase + offset], phrases[startPhrase + offset + 1]] as const,
    ).some(([left, right]) => left?.passes || right?.passes)) {
      const startingPhrase = phrases[startPhrase]
      if (startingPhrase) diagnostics.push(phraseDiagnostic('M3N_PHRASE_SPAN', `第 ${startingPhrase.melody.line} 行：连音不能跨越跳房子边界`, startingPhrase.melody))
    }
  }
  return diagnostics
}

function validatePhraseHarmony(document: ScoreDocument, structure: M3NDocumentStructure) {
  const diagnostics: ScoreDiagnostic[] = []
  const part = document.parts.get('score')
  if (!part) return diagnostics
  let pendingTie: { symbol: string; line: number } | undefined

  for (const section of structure.sections) {
    for (const phrase of section.phrases) {
      if (!phrase.melody || !phrase.harmony) continue
      const melody = phrase.melody
      const melodyEnd = melody.start + melody.text.length
      const measures = part.melody.filter((measure) => measure.events.some((event) =>
        melody.start <= event.sourceStart && event.sourceStart < melodyEnd))
      const harmonyMeasures = phrase.harmony.text.split(/\|+/)
      if (harmonyMeasures.at(-1)?.trim() === '') harmonyMeasures.pop()
      if (harmonyMeasures.length !== measures.length) {
        diagnostics.push(phraseDiagnostic('M3N_HARMONY', `第 ${phrase.harmony.line} 行：和弦行小节数量不匹配：旋律 ${measures.length} 小节，和弦 ${harmonyMeasures.length} 小节`, phrase.harmony))
      }

      for (const [measureIndex, source] of harmonyMeasures.entries()) {
        let depth = 0
        let beats = 0
        let cursor = 0
        let lastChord: string | undefined
        const tokenPattern = /\s+|\(|\)|~|(?:VII|III|II|IV|VI|V|I|vii|iii|ii|iv|vi|v|i)(?:m|dim|aug|sus2|sus4|maj7|maj9|[2-9]|1[0-3])?/gy
        while (cursor < source.length) {
          tokenPattern.lastIndex = cursor
          const match = tokenPattern.exec(source)
          if (!match) {
            const invalid = /^\S+/.exec(source.slice(cursor))?.[0] ?? source[cursor]!
            diagnostics.push(phraseDiagnostic('M3N_HARMONY', `第 ${phrase.harmony.line} 行：和弦符号非法：${invalid}`, phrase.harmony))
            cursor += invalid.length
            lastChord = undefined
            continue
          }
          cursor = tokenPattern.lastIndex
          const value = match[0]
          if (/^\s+$/.test(value)) continue
          if (value === '(') {
            depth += 1
            lastChord = undefined
            continue
          }
          if (value === ')') {
            if (depth === 0) diagnostics.push(phraseDiagnostic('M3N_HARMONY', `第 ${phrase.harmony.line} 行：和弦行圆括号关闭顺序错误`, phrase.harmony))
            else depth -= 1
            continue
          }
          if (value === '~') {
            if (!lastChord) diagnostics.push(phraseDiagnostic('M3N_HARMONY', `第 ${phrase.harmony.line} 行：和弦延续线必须紧跟和弦符号`, phrase.harmony))
            else pendingTie = { symbol: lastChord, line: phrase.harmony.line }
            lastChord = undefined
            continue
          }
          if (!m3nChord(value, 'C')) {
            diagnostics.push(phraseDiagnostic('M3N_HARMONY', `第 ${phrase.harmony.line} 行：和弦符号非法：${value}`, phrase.harmony))
            lastChord = undefined
            continue
          }
          if (pendingTie && pendingTie.symbol !== value) diagnostics.push(sourceDiagnostic('M3N_HARMONY', `第 ${pendingTie.line} 行：和弦延续线两端必须是相同和弦`))
          pendingTie = undefined
          lastChord = value
          const measure = measures[measureIndex]
          const capacity = measure?.events.reduce((sum, event) => sum + event.beats, 0) ?? 0
          beats += capacity / 2 ** depth
        }
        if (depth > 0) diagnostics.push(phraseDiagnostic('M3N_HARMONY', `第 ${phrase.harmony.line} 行：和弦行圆括号必须在同一小节内闭合`, phrase.harmony))
        const expected = measures[measureIndex]?.events.reduce((sum, event) => sum + event.beats, 0)
        if (expected !== undefined && Math.abs(beats - expected) > 1e-9) {
          diagnostics.push(phraseDiagnostic('M3N_HARMONY', `第 ${phrase.harmony.line} 行：和弦第 ${measureIndex + 1} 小节时值不匹配：旋律 ${expected} 拍，和弦 ${beats} 拍`, phrase.harmony))
        }
      }
    }
  }
  if (pendingTie) diagnostics.push(sourceDiagnostic('M3N_HARMONY', `第 ${pendingTie.line} 行：和弦延续线没有紧接的同和弦目标`))
  return diagnostics
}

function validatePhraseLyrics(document: ScoreDocument, structure: M3NDocumentStructure) {
  const diagnostics: ScoreDiagnostic[] = []
  for (const section of structure.sections) {
    for (const phrase of section.phrases) {
      if (phrase.lyrics.length === 0) continue
      const targets = phraseLyricTargets(document, structure, section.name, phrase)
      const rows = new Map(phrase.lyrics.map((row) => [row.label, row]))
      const generic = rows.get('')
      if (generic) {
        for (const [pass, passTargets] of targets) validateLyricMeasureAlignment(diagnostics, phrase, pass, generic, passTargets)
        continue
      }
      const requiredPasses = Math.max(0, ...targets.keys())
      for (const [pass, passTargets] of targets) {
        const row = rows.get(String(pass))
        if (!row) {
          diagnostics.push(sourceDiagnostic('M3N_LYRIC_ALIGNMENT', `第 ${phrase.line} 行：乐句缺少 L${pass}: 歌词行`, undefined, 'warning'))
          continue
        }
        const reference = /^\{L(\d+)\}$/.exec(row.text.trim())
        const referenced = reference ? rows.get(reference[1] ?? '') : row
        if (reference && (!referenced || Number(reference[1]) >= pass)) {
          diagnostics.push(phraseDiagnostic('M3N_LYRIC_ALIGNMENT', `第 ${phrase.line} 行：L${pass}: 只能引用同一乐句中更早的编号歌词行`, row, 'warning'))
          continue
        }
        const lyric = { text: referenced?.text ?? '', start: referenced?.start ?? row.start }
        validateLyricMeasureAlignment(diagnostics, phrase, pass, lyric, passTargets)
      }
      for (const label of rows.keys()) {
        const pass = Number(label)
        if (targets.has(pass)) continue
        const row = rows.get(label)!
        if (phrase.passes) {
          diagnostics.push(phraseDiagnostic('M3N_LYRIC_ALIGNMENT', `第 ${phrase.line} 行：L${label}: 不属于该房子的遍次`, row, 'warning'))
        } else if (pass > requiredPasses) {
          diagnostics.push(phraseDiagnostic('M3N_LYRIC_ALIGNMENT', `第 ${phrase.line} 行：L${label}: 超出乐句实际演奏次数 ${requiredPasses}`, row, 'warning'))
        }
      }
    }
  }
  return diagnostics
}

function structureTokens(source: string, structure: M3NDocumentStructure, staff: 'melody' | 'bass') {
  if (structure.sections.length === 0) return staff === 'melody' ? tokenizeM3N(source) : []
  const rows = structure.sections.flatMap((section) => section.phrases.flatMap((phrase) => {
    const row = staff === 'melody' ? phrase.melody : phrase.bass
    return row ? [row] : []
  }))
  const header = staff === 'melody' ? tokenizeM3N(structure.header) : []
  return [...header, ...rows.flatMap((row) => tokenizeM3N(row.text).map((token) => ({
    ...token,
    line: row.line + token.line - 1,
    start: row.start + token.start,
    end: row.start + token.end,
  })))]
}

function validateSourceRules(source: string, structure: M3NDocumentStructure): ScoreDiagnostic[] {
  const diagnostics: ScoreDiagnostic[] = []
  const mainResult = validateBody(structureTokens(source, structure, 'melody'), diagnostics, {
    requireTerminal: structure.sections.length === 0,
  })
  const bassTokens = structureTokens(source, structure, 'bass')
  if (bassTokens.length > 0) {
    validateBody(bassTokens, diagnostics, {
      bass: true,
      initial: mainResult.initial,
      inheritedSettingEvents: mainResult.settingEvents,
    })
  }
  return [...new Map(diagnostics.map((diagnostic) => [`${diagnostic.code}:${diagnostic.message}`, diagnostic])).values()]
}
type ValidationContext = { document?: ScoreDocument; projection?: M3NDocumentProjection; syntaxTree?: M3NSyntaxTree }

function validationResult(source: string, options: { skipBeatValidation?: boolean }, context: ValidationContext = {}) {
  const projected = context.projection ?? projectM3NDocument(source, context.syntaxTree)
  const parsed = context.document ?? parseM3NDocument(source, projected)
  const typedSourceRuleDiagnostics = validateSourceRules(source, projected.structure)
  const phraseDiagnostics = projected.structure.sections.length > 0
    ? validatePhrasePlaybackPasses(parsed, projected.structure)
    : []
  const phraseSpanDiagnostics = projected.structure.sections.length > 0
    ? validatePhraseSpans(parsed, projected.structure)
    : []
  const harmonyDiagnostics = projected.structure.sections.length > 0
    ? validatePhraseHarmony(parsed, projected.structure)
    : []
  const lyricDiagnostics = projected.structure.sections.length > 0 ? validatePhraseLyrics(parsed, projected.structure) : []
  const scoreDiagnostics = validateScoreDocument(parsed, { ...options, source })
  const syntaxDiagnostics = validateM3NSyntaxTree(context.syntaxTree ?? parseM3NSyntaxTree(source))
  const sourceDiagnostics = [
    ...typedSourceRuleDiagnostics,
    ...phraseDiagnostics,
    ...phraseSpanDiagnostics,
    ...harmonyDiagnostics,
    ...lyricDiagnostics,
  ]
  return [...projected.structure.diagnostics, ...sourceDiagnostics, ...syntaxDiagnostics, ...scoreDiagnostics]
}

export function validateM3NDiagnostics(source: string, options: { skipBeatValidation?: boolean } = {}, document?: ScoreDocument, context: Omit<ValidationContext, 'document'> = {}): ScoreDiagnostic[] {
  return validationResult(source, options, { ...context, document })
}

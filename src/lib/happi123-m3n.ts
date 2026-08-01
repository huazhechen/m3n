import { addTiesToNotes, convertHappiNote, extractHappiNotes, readHappiNote } from './happi123/notes'
import { convertHappiLyrics } from './happi123/lyrics'
import { getHappi123Metadata } from './happi123/metadata'
import { validateM3N } from './m3n-validate'
import type { ConversionResult } from './notation/types'

type HappiHeader = {
  title: string
  subtitle: string
  singer: string
  composer: string
  lyricist: string
  key: string
  meter: string
  meters: string[]
  bpm: string
  parts: string
}

type SequenceResult = {
  output: string
  hasMusic: boolean
}

type ConversionState = {
  lastPitch: string | null
}

const defaultHeader: HappiHeader = {
  title: '',
  subtitle: '',
  singer: '',
  composer: '',
  lyricist: '',
  key: 'C',
  meter: '4/4',
  meters: ['4/4'],
  bpm: '',
  parts: '',
}

function normalizeKey(value: string) {
  const normalized = value.trim().replace(/^1=/i, '').replace(/\d+$/, '')
  const prefixMatch = /^([#b])([A-G])$/i.exec(normalized)
  const suffixMatch = /^([A-G])([#b]?)$/i.exec(normalized)
  const match = prefixMatch ?? suffixMatch
  if (!match) {
    return normalized || 'C'
  }
  if (prefixMatch) {
    return `${match[2].toUpperCase()}${match[1].toLowerCase() === 'b' ? 'b' : '#'}`
  }
  return `${match[1].toUpperCase()}${match[2] ?? ''}`
}

function normalizePartOrder(value: string) {
  return value
    .replace(/[,，]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

function numericChordToRoman(value: string) {
  const match = /^([1-7])(m|dim|aug|sus[24]?|[2-9]|1[0-3])?$/i.exec(value.trim())
  if (!match) {
    return value.trim()
  }
  const degrees = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
  const suffix = match[2] ?? ''
  const minor = suffix.toLowerCase() === 'm'
  const roman = minor ? degrees[Number(match[1]) - 1].toLowerCase() : degrees[Number(match[1]) - 1]
  return `${roman}${minor ? '' : suffix === 'dim' ? 'dim' : suffix}`
}

function findInstrumentalClosing(source: string, start: number) {
  let index = start + 2
  while (index < source.length - 1) {
    if (source.startsWith('{{', index)) {
      const nestedEnd = findInstrumentalClosing(source, index)
      if (nestedEnd < 0) return -1
      index = nestedEnd + 2
      continue
    }
    if (source[index] === '{') {
      const tagEnd = source.indexOf('}', index + 1)
      if (tagEnd < 0) return -1
      index = tagEnd + 1
      continue
    }
    if (source.startsWith('}}', index)) return index
    index += 1
  }
  return -1
}

function findClosing(source: string, start: number, open: string, close: string) {
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === open) depth += 1
    if (source[index] === close) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function convertTuplet(inner: string, diagnostics: string[]) {
  const annotations = [...inner.matchAll(/\{([^{}]+)\}/g)]
    .map((match) => convertTag(match[1], diagnostics))
    .join('')
  const hasStaccato = /st/.test(inner)
  const trailingBar = inner.includes('|') ? ' |' : ''
  const notation = inner
    .replace(/\{[^{}]+\}/g, '')
    .replace(/(?:st|tr~?)/g, '')
    .replace(/[|$]/g, '')
  const notes = extractHappiNotes(notation)
  const residue = notes.reduce((value, note) => value.replace(note.raw, ''), notation).replace(/\s+/g, '')
  if (notes.length < 2 || residue) {
    diagnostics.push(`三连音内容无法无损解析：(${inner})`)
    return convertSequence(inner, diagnostics).output
  }
  const depths = new Set(notes.map((note) => note.depth))
  if (depths.size !== 1) {
    diagnostics.push(`三连音内部时值不一致：(${inner})`)
  }
  const depth = Math.min(...notes.map((note) => note.depth))
  const group = `[${notes.map((note) => note.pitch).join('')}:2]`
  return `${annotations}${'('.repeat(depth)}${group}${')'.repeat(depth)}${hasStaccato ? '{tip}' : ''}${trailingBar}`
}

function convertTag(content: string, diagnostics: string[]) {
  const trimmed = content.trim()
  const separator = trimmed.search(/[:=]/)
  const name = (separator >= 0 ? trimmed.slice(0, separator) : trimmed).trim()
  const value = separator >= 0 ? trimmed.slice(separator + 1).trim() : ''

  if (name === '__linebreak__' || name === 'br') return '{br}'
  if (/^\d+\/\d+$/.test(trimmed)) return `{${trimmed}}`
  if (name === 'mark') return `{part=${value}}`
  if (name === 'section') return `{part=${value}}`
  if (name === 'tip') return `{text=${value}}`
  if (name === 'rest') return `{rest=${value}}`
  if (name === 'chord') return `{chord=${numericChordToRoman(value)}}`
  if (name === 'bpm' && /^\d+$/.test(value)) return `{${value}qpm}`
  if (name === '1') return `{key=${normalizeKey(value)}}`
  if (name === 'p' || name === 'mf' || name === 'ff' || name === 'f' && !value) return `{${name}}`
  if (name === 'sf') return '{sfz}'
  if (name === 'dim') return '{text=dim.}'
  if (name === 'cresc') return '{text=cresc.}'
  if (name === 'S' || name === 'start') return '||:'
  if (name.toLowerCase() === 'dc' || name.toLowerCase() === 'ds') return ':||'
  if (name === 'fine' || name === 'jump') return ''
  if (name === 'octave') return ''
  if (name === 'hot' || name === 'ms' || name === 'omit' || name === 'f' || /^o\d+f$/.test(name)) {
    diagnostics.push(`已忽略仅影响原编辑器播放的标签：{${trimmed}}`)
    return ''
  }
  if (name === 'repeat') {
    diagnostics.push(`M3N 暂无指定重复次数语法：{${trimmed}}`)
    return `{text=repeat ${value}}`
  }
  if (trimmed.startsWith('!') && trimmed.endsWith('!')) return ''
  if (/^\d+$/.test(trimmed)) return ''

  diagnostics.push(`无法识别的 Happi123 标签：{${trimmed}}`)
  return `{text=${trimmed.replace(/[{}]/g, '')}}`
}

function applySuffixToGroup(inner: string, suffix: string) {
  const notes = extractHappiNotes(inner)
  const finalNote = notes.at(-1)
  if (!finalNote || !suffix) return inner
  return `${inner.slice(0, finalNote.end)}${suffix}${inner.slice(finalNote.end)}`
}

function normalizeNotationSpacing(source: string) {
  return source
    .replace(/([0-7][#bngd,'"]*)\s+([_=/x.]+)/g, '$1$2')
    .replace(/(^|[|\s])([_=/x.]+)([#bn]?[0-7])/g, '$1$3$2')
    .replace(/([#bn]?[0-7][#bngd,'"]*)(st|tr~?)([_=/x.-]+)/g, '$1$3$2')
    .replace(/([#bn]?[0-7][#bngd,'"]*)(\{tip:[^}]+\})([_=/x.~-]+)/g, '$1$3$2')
}

const M3N_BARLINE = /((?::\|\|\||:\|\|:|:\|\||\|\|\||\|\|:|\|\||\|))/

function measureMatchesMeter(source: string, meter: string) {
  const diagnostics = validateM3N(`{${meter}}\n${source} |`)
  return !diagnostics.some((diagnostic) => diagnostic.includes('拍数'))
}

function applyMixedMeters(source: string, meters: string[]) {
  if (meters.length < 2) return source

  const pieces = source.split(M3N_BARLINE)
  let currentMeter = meters[0]
  for (let index = 0; index < pieces.length; index += 2) {
    const measure = pieces[index]
    if (!/[0-7]/.test(measure) || measureMatchesMeter(measure, currentMeter)) continue
    const matches = meters.filter((meter) => measureMatchesMeter(measure, meter))
    if (matches.length !== 1 || matches[0] === currentMeter) continue
    currentMeter = matches[0]
    const layoutPrefix = /^\s*(?:\{br\}\s*)*/.exec(measure)?.[0] ?? ''
    pieces[index] = `${layoutPrefix}{${currentMeter}} ${measure.slice(layoutPrefix.length)}`
  }
  return pieces.join('')
}

function inferCorrectedMeter(source: string, declaredMeter: string) {
  const measures = source
    .split(M3N_BARLINE)
    .filter((_piece, index) => index % 2 === 0)
    .filter((measure) => /[0-7]/.test(measure))
  if (measures.length < 4) return declaredMeter

  const candidates = [...new Set([declaredMeter, '2/4', '3/4', '4/4'])]
  const scores = candidates.map((meter) => ({
    meter,
    matches: measures.filter((measure) => measureMatchesMeter(measure, meter)).length,
  })).sort((left, right) => right.matches - left.matches)
  const best = scores[0]
  const declared = scores.find((score) => score.meter === declaredMeter)
  if (
    best.meter !== declaredMeter
    && best.matches >= 4
    && best.matches / measures.length >= 0.8
    && best.matches >= (declared?.matches ?? 0) * 2
  ) return best.meter
  return declaredMeter
}

function tiePreviousRenderedNote(output: string[], pitch: string) {
  const pattern = new RegExp(`\\(*${pitch}(?:\\^+)?(?:\\.*)?(~?)\\)*`, 'g')
  for (let index = output.length - 1; index >= 0; index -= 1) {
    const matches = [...output[index].matchAll(pattern)]
    const match = matches.at(-1)
    if (!match || match.index === undefined) continue
    if (match[1] !== '~') {
      const closingLength = /\)*$/.exec(match[0])?.[0].length ?? 0
      const insertion = match.index + match[0].length - closingLength
      output[index] = `${output[index].slice(0, insertion)}~${output[index].slice(insertion)}`
    }
    return true
  }
  return false
}

function convertSequence(
  rawSource: string,
  diagnostics: string[],
  state: ConversionState = { lastPitch: null },
): SequenceResult {
  const source = normalizeNotationSpacing(rawSource)
  const output: string[] = []
  let hasMusic = false
  let index = 0

  while (index < source.length) {
    const rest = source.slice(index)
    const whitespace = /^\s+/.exec(rest)
    if (whitespace) {
      // Happi123 line wrapping is source formatting, not score layout.
      output.push(' ')
      index += whitespace[0].length
      continue
    }

    if (rest.startsWith('{+')) {
      const end = rest.indexOf('}')
      if (end >= 0) {
        const alternatives = rest.slice(2, end).split('%%')
        if (alternatives.length === 2) {
          const primaryState = { ...state }
          const alternativeState = { ...state }
          const primary = convertSequence(alternatives[0], diagnostics, primaryState)
          const alternative = convertSequence(alternatives[1], diagnostics, alternativeState)
          output.push(`{volta=1}${primary.output}{/} {volta=2}${alternative.output}{/}`)
          state.lastPitch = primaryState.lastPitch ?? alternativeState.lastPitch
          hasMusic ||= primary.hasMusic || alternative.hasMusic
        } else {
          diagnostics.push(`替代谱块必须恰好包含一个 %%：${rest.slice(0, end + 1)}`)
          output.push(convertSequence(alternatives[0] ?? '', diagnostics, state).output)
        }
        index += end + 1
        continue
      }
    }

    if (rest.startsWith('{{')) {
      const end = findInstrumentalClosing(rest, 0)
      if (end >= 0) {
        const inner = convertSequence(rest.slice(2, end), diagnostics, state)
        output.push(`{inst}${inner.output}{/}`)
        hasMusic ||= inner.hasMusic
        index += end + 2
        continue
      }
      diagnostics.push('器乐区间缺少右双大括号：{{')
      index += 2
      continue
    }

    const dynamicGroup = /^\{([<>])([\s\S]*?)\1\}/.exec(rest)
    if (dynamicGroup) {
      const inner = convertSequence(dynamicGroup[2], diagnostics, state)
      output.push(`${dynamicGroup[1] === '<' ? '{cresc}' : '{decres}'}${inner.output}{/}`)
      index += dynamicGroup[0].length
      hasMusic ||= inner.hasMusic
      continue
    }

    if (rest[0] === '{') {
      const end = rest.indexOf('}')
      if (end >= 0) {
        const converted = convertTag(rest.slice(1, end), diagnostics)
        output.push(converted)
        if (/^\{rest=/.test(converted)) hasMusic = true
        index += end + 1
        continue
      }
    }

    if (rest[0] === '[') {
      const end = findClosing(rest, 0, '[', ']')
      if (end >= 0) {
        const inner = rest.slice(1, end)
        const volta = /^(\d+(?:[-,]\d+)*):/.exec(inner)
        if (volta) {
          const content = convertSequence(inner.slice(volta[0].length), diagnostics, state)
          output.push(`{volta=${volta[1].replace(/-/g, '~')}}${content.output}{/}`)
          hasMusic ||= content.hasMusic
        } else {
          diagnostics.push(`无法识别的房子语法：[${inner}]`)
          output.push(convertSequence(inner, diagnostics, state).output)
        }
        index += end + 1
        continue
      }
      const volta = /^\[(\d+(?:[-,]\d+)*):/.exec(rest)
      if (volta) {
        diagnostics.push(`房子缺少右方括号，已按文末闭合：${volta[1]}`)
        const content = convertSequence(rest.slice(volta[0].length), diagnostics, state)
        output.push(`{volta=${volta[1].replace(/-/g, '~')}}${content.output}{/}`)
        hasMusic ||= content.hasMusic
        index = source.length
        continue
      }
    }

    if (rest[0] === '(') {
      const end = findClosing(rest, 0, '(', ')')
      if (end >= 0) {
        const rawInner = rest.slice(1, end)
        const isGrace = rest[end + 1] === '@'
        const suffix = /^([gd,'"_=/x.~-]+)/.exec(rest.slice(end + 1))?.[1] ?? ''
        if (isGrace) {
          const pitches = extractHappiNotes(rawInner).map((note) => note.pitch).filter((pitch) => pitch !== '0')
          if (pitches.length > 0) {
            output.push(`{ac(${pitches.join('')})}`)
          }
        } else if (/^3\s*:/.test(rawInner)) {
          output.push(convertTuplet(rawInner.replace(/^3\s*:/, ''), diagnostics))
        } else {
          const tieGroup = /^t\s*:/.test(rawInner)
          const inner = applySuffixToGroup(rawInner.replace(/^t\s*:/, ''), suffix)
          const notes = extractHappiNotes(inner)
          const samePitch = notes.length > 1 && new Set(notes.map((note) => note.pitch)).size === 1
          if (tieGroup || samePitch) {
            output.push(convertSequence(addTiesToNotes(inner), diagnostics, state).output)
          } else {
            output.push(`{lg}${convertSequence(inner, diagnostics, state).output}{/}`)
          }
        }
        index += end + 1 + (isGrace ? 1 : suffix.length)
        hasMusic ||= !isGrace
        continue
      }
    }

    const bar = /^(?::\|\|\||:\|\|:|:\|:|:\|\||\|\|\||\|\||\|:|:\||\|)/.exec(rest)
    if (bar) {
      const mapped: Record<string, string> = {
        '|': '|',
        '||': '||',
        '|||': '|||',
        '|:': '||:',
        ':|': ':||',
        ':||': ':||',
        ':||:': ':||:',
        ':|:': ':||:',
        ':|||': ':|||',
      }
      output.push(mapped[bar[0]] ?? bar[0])
      index += bar[0].length
      hasMusic = true
      continue
    }

    const note = readHappiNote(source, index)
    if (note) {
      output.push(convertHappiNote(note))
      if (note.pitch !== '0') state.lastPitch = note.pitch
      index = note.end
      hasMusic = true
      continue
    }

    const ornament = /^(tr~?|st|v)/.exec(rest)
    if (ornament) {
      output.push(ornament[0].startsWith('tr') ? '{tr}' : ornament[0] === 'st' ? '{tip}' : '{breath}')
      index += ornament[0].length
      continue
    }
    if (rest[0] === '>') {
      output.push('{str}')
      index += 1
      continue
    }
    if (rest[0] === '@') {
      diagnostics.push('M3N 暂无 @ 奏法的明确映射。')
      index += 1
      continue
    }
    if (rest[0] === '-' && /^-+/.test(rest)) {
      const extension = /^-+/.exec(rest)?.[0] ?? '-'
      if (state.lastPitch) {
        tiePreviousRenderedNote(output, state.lastPitch)
        output.push(convertHappiNote({
          start: index,
          end: index + extension.length,
          raw: extension,
          pitch: state.lastPitch,
          depth: 0,
          dots: 0,
          duration: extension.length,
          tied: false,
        }))
      } else {
        diagnostics.push(`独立延长线缺少前置音符：${extension}`)
      }
      index += extension.length
      continue
    }
    if (rest[0] === ']' || rest[0] === '*') {
      index += 1
      continue
    }
    if (rest[0] === '$') {
      diagnostics.push('已忽略源谱中的孤立 $ 字符。')
      index += 1
      continue
    }

    const unknown = /^\S+/.exec(rest)?.[0] ?? rest[0]
    diagnostics.push(`无法识别的 Happi123 片段：${unknown}`)
    output.push(` {text=${unknown.replace(/[{}]/g, '')}} `)
    index += unknown.length
  }

  return { output: output.join(' ').replace(/\s+/g, ' ').trim(), hasMusic }
}

function parseSource(source: string) {
  const header = { ...defaultHeader }
  const lyrics: string[] = []
  let body = source

  body = body.replace(/\{(title|subtitle|singer|composer|lyricist|key_signature|time_signature|bpm|play):\s*([^}]*)\}/g, (_match, name, rawValue) => {
    const value = String(rawValue).trim()
    if (name === 'title') header.title = value
    if (name === 'subtitle') header.subtitle = value
    if (name === 'singer') header.singer = value
    if (name === 'composer') header.composer = value
    if (name === 'lyricist') header.lyricist = value
    if (name === 'key_signature') header.key = normalizeKey(value)
    if (name === 'time_signature') {
      const meters = value.match(/\d+\/\d+/g) ?? []
      header.meters = meters.length > 0 ? meters : header.meters
      header.meter = meters[0] ?? header.meter
    }
    if (name === 'bpm') header.bpm = value
    if (name === 'play') header.parts = normalizePartOrder(value)
    return ''
  })

  body = body.replace(/\{lyric\}([\s\S]*?)\{\/lyric\}/g, (_match, value) => {
    lyrics.push(convertHappiLyrics(String(value)))
    return ''
  })

  body = body.replace(
    /^\s*([A-Za-z\u3400-\u9fff][^{}()[\]:|\r\n]{0,47}):\s*/gm,
    (_match, label) => `{mark:${String(label).trim()}} `,
  )
  body = body.replace(
    /(\{br\}\s*)([A-Za-z\u3400-\u9fff][^{}()[\]:|\r\n]{0,47}):\s*/g,
    (_match, prefix, label) => `${prefix}{mark:${String(label).trim()}} `,
  )
  body = applyDacapoStructure(body, header)
  body = applyDalSegnoStructure(body, header)
  return { header, body, lyrics }
}

function applyDacapoStructure(body: string, header: HappiHeader) {
  if (header.parts || /\{(?:mark|section)[:=]/i.test(body)) return body

  const dacapo = /\{dc\}/i
  if (!dacapo.test(body)) return body

  const jumps = [...body.matchAll(/\{jump\}/gi)]
  if (jumps.length === 2) {
    let jumpIndex = 0
    header.parts = 'DC1 DC2 DC1 CODA'
    return `{mark:DC1} ${body.replace(/\{dc\}\s*/i, '').replace(/\{jump\}/gi, () => {
      jumpIndex += 1
      return jumpIndex === 1 ? '{mark:DC2}' : '{mark:CODA}'
    })}`
  }

  if (/\{fine\}/i.test(body)) {
    header.parts = 'DC1 DC2 DC1'
    return `{mark:DC1} ${body.replace(/\{fine\}/i, '{mark:DC2}').replace(/\{dc\}/i, '')}`
  }

  return body
}

function applyDalSegnoStructure(body: string, header: HappiHeader) {
  if (header.parts || /\{(?:mark|section)[:=]/i.test(body)) return body

  const markers = [...body.matchAll(/\{(?:S|start)\}/g)]
  const returns = [...body.matchAll(/\{ds\}/gi)]
  if (markers.length !== 1 || returns.length !== 1) return body

  const returnIndex = returns[0].index ?? body.length
  const returnEnd = returnIndex + returns[0][0].length
  const hasTail = extractHappiNotes(body.slice(returnEnd)).length > 0 || /\{rest:\s*\d+\}/.test(body.slice(returnEnd))
  const hasFine = /\{fine\}/i.test(body.slice(markers[0].index ?? 0, returnIndex))

  let structured = `{mark:DS1} ${body.replace(/\{(?:S|start)\}/, '{mark:DS2}')}`
  if (hasFine) {
    structured = structured.replace(/\{fine\}/i, '{mark:DS3}')
    structured = structured.replace(/\{ds\}/i, hasTail ? '{mark:DS4}' : '')
    header.parts = `DS1 DS2 DS3 DS2${hasTail ? ' DS4' : ''}`
  } else {
    structured = structured.replace(/\{ds\}/i, hasTail ? '{mark:DS3}' : '')
    header.parts = `DS1 DS2 DS2${hasTail ? ' DS3' : ''}`
  }

  return structured
}

function sectionParts(source: string) {
  const firstPartIndex = source.indexOf('{part=')
  return `${source.replace(/\{part=/g, (_match, offset) => offset === firstPartIndex ? '{part=' : '{/} {part=')} {/}`
}

export function happi123ToM3N(source: string): ConversionResult {
  const diagnostics: string[] = []
  const { header, body, lyrics } = parseSource(source)
  const converted = convertSequence(body, diagnostics).output
    .replace(/(?:\s*\{br\}\s*){2,}/g, ' {br} ')
    .replace(/^\s*\{br\}\s*/, '')
    .replace(/\s*\{br\}\s*$/, '')
  const definedParts = [...converted.matchAll(/\{part=([^}]+)\}/g)].map((match) => match[1].trim())
  if (!header.parts && definedParts.length > 0) {
    header.parts = definedParts.join(' ')
  } else if (header.parts) {
    const requested = header.parts.split(/\s+/).filter(Boolean)
    const undefinedParts = requested.filter((part) => !definedParts.includes(part))
    if (undefinedParts.length > 0) {
      diagnostics.push(`播放顺序引用未定义段落，已移除：${undefinedParts.join(', ')}`)
      header.parts = requested.filter((part) => definedParts.includes(part)).join(' ')
    }
  }
  const partCount = definedParts.length
  // A Happi123 terminal bar ends the source document, while an M3N part has
  // no terminal semantics.  Keep the repeat/section meaning, but remove the
  // document terminator before wrapping source sections as parts.
  const sectionedMusic = partCount > 0
    ? sectionParts(
      converted
        .replace(/:\|\|\|/g, ':||')
        .replace(/\|\|\|/g, '||'),
    )
    : /(?:\|\|\||:\|\|\|)\s*$/.test(converted) ? converted : `${converted} |||`
  if (header.meters.length === 1) {
    const correctedMeter = inferCorrectedMeter(sectionedMusic, header.meter)
    if (correctedMeter !== header.meter) {
      diagnostics.push(`源谱拍号与小节时值不符，已从 ${header.meter} 更正为 ${correctedMeter}`)
      header.meter = correctedMeter
      header.meters = [correctedMeter]
    }
  }
  const music = applyMixedMeters(sectionedMusic, header.meters)
  const metadata = getHappi123Metadata(header.title)

  const output = [
    header.title ? `{title=${header.title}}` : '',
    header.subtitle ? `{subtitle=${header.subtitle}}` : '',
    header.singer ? `{singer=${header.singer}}` : '',
    header.composer || metadata.composer ? `{composer=${header.composer || metadata.composer}}` : '',
    header.lyricist || metadata.lyricist ? `{lyricist=${header.lyricist || metadata.lyricist}}` : '',
    '{source=Happi123}',
    header.parts ? `{parts=${header.parts}}` : '',
    `{key=${header.key}} {${header.meter}}${/^\d+$/.test(header.bpm) ? ` {${header.bpm}qpm}` : ''}`,
    music,
    ...lyrics.flatMap((value, index) => [
      '',
      lyrics.length > 1 ? `{lyrics=${index + 1}}` : '{lyrics}',
      value,
      '{/}',
    ]),
  ].filter(Boolean).join('\n').replace(/\s*\{br\}\s*/g, ' {br}\n')

  return { source, output, diagnostics: [...new Set(diagnostics)] }
}

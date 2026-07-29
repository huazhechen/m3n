import type { ConversionResult } from './m3n-abc'

type HappiHeader = {
  title: string
  subtitle: string
  key: string
  meter: string
  bpm: string
  parts: string
}

const defaultHeader: HappiHeader = {
  title: '',
  subtitle: '',
  key: 'C',
  meter: '4/4',
  bpm: '',
  parts: '',
}

function convertNote(token: string) {
  const match = /^(0|[1-7])([#bn]?)([,"']*)([_=]*)(\.*)(-*)$/.exec(token)
  if (!match) {
    return token
  }

  const [, degree, accidental, octave, shortDuration, dots, longDuration] = match
  const accidentalValue = accidental === 'n' ? '=' : accidental
  const octaveValue = `${'d'.repeat((octave.match(/,/g) ?? []).length)}${'e'.repeat((octave.match(/'/g) ?? []).length + (octave.match(/"/g) ?? []).length * 2)}`
  const base = `${degree}${accidentalValue}${octaveValue}`
  const dotValue = dots
  const longValue = longDuration.length === 0
    ? ''
    : longDuration.length === 1
      ? '^'
      : longDuration.length === 2
        ? '^.'
        : '^'.repeat(longDuration.length - 1)
  const value = `${base}${longValue}${dotValue}`
  const depth = shortDuration.includes('=') ? 2 : shortDuration.length
  return depth > 0 ? `${'('.repeat(depth)}${value}${')'.repeat(depth)}` : value
}

function convertTuplets(source: string, diagnostics: string[]) {
  return source
    .replace(/\(3:\s*([0-7][#bn]?[,"']*(?:[_=]*)(?:\.*)(?:-*)?(?:\s*[0-7][#bn]?[,"']*(?:[_=]*)(?:\.*)(?:-*)?){2})\s*\)/g, (_match, notes) => {
      const converted = String(notes).match(/(?:0|[1-7])[#bn]?[,"']*[_=]*\.*-*/g)?.map(convertNote) ?? []
      if (converted.some((note) => /[()]/.test(note))) {
        diagnostics.push('Happi123 三连音中的短时值未能转换为 M3N 连音组。')
        return converted.join(' ')
      }
      return `[${converted.join(' ')}:2]`
    })
    .replace(/\(t:\s*([^\s)]+)\s*\)/g, (_match, notes) => {
      const tokens = String(notes).match(/(?:0|[1-7])[#bn]?[,"']*[_=]*\.*-*/g) ?? []
      const converted = tokens.map(convertNote)
      if (converted.length > 1 && converted.every((note) => note === converted[0])) {
        const duration = converted.length === 2 ? '^' : converted.length === 3 ? '^.' : converted.length === 4 ? '^^' : ''
        if (duration) {
          return `${converted[0]}${duration}`
        }
      }
      diagnostics.push('Happi123 同音连线无法直接表示，已展开为独立音符。')
      return converted.join(' ')
    })
}

export function happi123ToM3N(source: string): ConversionResult {
  const diagnostics: string[] = []
  const header = { ...defaultHeader }
  const lyrics: string[] = []
  let music = source.replace(/\{![\s\S]*?!\}/g, '')

  music = music.replace(/\{(title|subtitle|key_signature|time_signature|bpm|play):\s*([^}]*)\}/g, (_match, name, value) => {
    const trimmed = String(value).trim()
    if (name === 'title') header.title = trimmed
    if (name === 'subtitle') header.subtitle = trimmed
    if (name === 'key_signature') header.key = trimmed || header.key
    if (name === 'time_signature') header.meter = trimmed || header.meter
    if (name === 'bpm') header.bpm = trimmed
    if (name === 'play') header.parts = trimmed
    return ''
  })

  music = music.replace(/\{lyric\}([\s\S]*?)\{\/lyric\}/g, (_match, text) => {
    lyrics.push(String(text).trim())
    return ''
  })
  music = music.replace(/\{mark:\s*([^}]+)\}/g, (_match, value) => `{part=${String(value).trim()}}`)
  music = music.replace(/\{chord:\s*([^}]+)\}/g, (_match, value) => `{chord=${String(value).trim()}}`)
  music = convertTuplets(music, diagnostics)
  if (/\([^)]*\)/.test(music)) {
    diagnostics.push('Happi123 普通连音线仅保留音符顺序，未转换为独立的 M3N 表情。')
    music = music.replace(/[()]/g, '')
  }

  const convertedMusic = music
    .replace(/(?:0|[1-7])[#bn]?[,"']*[_=]*\.*-*/g, convertNote)
    .replace(/v/g, '{breath}')
    .replace(/\|\|\|/g, '|||')
    .replace(/\|\|/g, '||')
    .replace(/\|/g, '|')
    .replace(/\s+/g, ' ')
    .trim()

  const output = [
    header.title ? `{title=${header.title}}` : '',
    header.subtitle ? `{subtitle=${header.subtitle}}` : '',
    `{key=${header.key}} {${header.meter}}${header.bpm ? ` {tempo=${header.bpm}bpm}` : ''}${header.parts ? ` {parts=${header.parts}}` : ''}`,
    convertedMusic,
    ...lyrics.flatMap((text) => ['', '{lyrics}', text, '{/}']),
  ].filter(Boolean).join('\n')

  return { source, output, diagnostics }
}

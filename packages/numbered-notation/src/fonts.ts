import { SCORE_MUSIC_FONT, SCORE_CJK_FONT, SCORE_LATIN_FONT } from './font-family.js'
import { scoreLayoutConfig } from './score-layout-config.js'
import { LATIN_FONTS, CJK_FONTS, BRAVURA_FONTS } from './font-resources.js'

export type ScoreFontResource = { file: string; url: string; webUrl?: string; characters: string; weight?: number; style?: string }
const buffers = new Map<string, Promise<Uint8Array>>()
const installed = new Map<string, Promise<void>>()
const coverage = new Map<string, Set<string>>()
let bundledCjk: ScoreFontResource | undefined

/** Seed one shared download for screen installation, PNG outlines and PDF subsets. */
export function registerScoreFontBundle(fonts: readonly (ScoreFontResource & { data: Uint8Array })[]): void {
  for (const font of fonts) {
    buffers.set(font.file, Promise.resolve(font.data))
    if (font.file === 'NotoSansSC-library.ttf') bundledCjk = font
  }
}
const supports = (font: ScoreFontResource, char: string) => {
  let chars = coverage.get(font.file)
  if (!chars) { chars = new Set(font.characters); coverage.set(font.file, chars) }
  return chars.has(char)
}

/** Includes metadata and lyric visits; Map values are part of ScoreDocument. */
export function scoreFontText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Map) return [...value.values()].map(scoreFontText).join('')
  if (Array.isArray(value)) return value.map(scoreFontText).join('')
  if (value && typeof value === 'object') return Object.values(value).map(scoreFontText).join('')
  return ''
}

export function scoreCjkFont(text: string): ScoreFontResource {
  const chars = [...new Set(text)].filter(c => !/\s|[\u200B\u2800]/u.test(c) && !supports(LATIN_FONTS[0], c) && !supports(BRAVURA_FONTS[0], c))
  if (bundledCjk && chars.every(c => supports(bundledCjk!, c))) return bundledCjk
  const font = [...CJK_FONTS].sort((a, b) => a.bytes - b.bytes).find(font => chars.every(c => supports(font, c)))
  if (!font) throw new Error('乐谱包含三种字体均未覆盖的字符，请检查文字。')
  return font
}

export function scoreFontForCharacter(char: string, textFont: ScoreFontResource, _weight: number = scoreLayoutConfig.fonts.regularWeight, _italic = false, _numbers = false, family = ''): ScoreFontResource {
  if (family.startsWith(SCORE_CJK_FONT) && supports(textFont, char)) return textFont
  const latin = LATIN_FONTS[0]
  if (supports(latin, char)) return latin
  if (supports(BRAVURA_FONTS[0], char)) return BRAVURA_FONTS[0]
  if (supports(textFont, char)) return textFont
  throw new Error(`乐谱字体缺少字符：${char}`)
}

export function loadScoreFont(font: ScoreFontResource): Promise<Uint8Array> {
  let request = buffers.get(font.file)
  if (!request) {
    request = (async () => {
      const response = await fetch(font.url)
      if (!response.ok) throw new Error('乐谱字体加载失败，请重试。')
      return new Uint8Array(await response.arrayBuffer())
    })().catch(error => { buffers.delete(font.file); throw error })
    buffers.set(font.file, request)
  }
  return request
}

function unicodeRange(text: string) {
  const codes = [...new Set([...text].map(c => c.codePointAt(0)!))].sort((a, b) => a - b)
  const ranges: string[] = []
  for (let i = 0; i < codes.length; i++) {
    const start = codes[i]!
    let end = start
    while (codes[i + 1] === end + 1) { end++; i++ }
    ranges.push(`U+${start.toString(16)}${end > start ? `-${end.toString(16)}` : ''}`)
  }
  return ranges.join(',')
}

function install(font: ScoreFontResource, family: string) {
  const key = `${font.file}:${family}`
  let promise = installed.get(key)
  if (!promise) {
    promise = (async () => {
      const source = font.webUrl && !buffers.has(font.file) ? `url("${font.webUrl}")` : Uint8Array.from(await loadScoreFont(font))
      const face = new FontFace(family, source, {
        weight: String(font.weight ?? scoreLayoutConfig.fonts.regularWeight), style: font.style ?? 'normal', unicodeRange: unicodeRange(font.characters),
      })
      await face.load()
      document.fonts.add(face)
    })().catch(error => { installed.delete(key); throw error })
    installed.set(key, promise)
  }
  return promise
}

/** Choose the smallest preset covering this score before measuring any glyphs. */
export async function prepareNumberedNotationFonts(value?: unknown, options: { systemCjk?: boolean } = {}): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return
  const text = scoreFontText(value) + '演唱作词作曲音域：→'
  const cjk = options.systemCjk ? undefined : scoreCjkFont(text)
  await Promise.all([
    ...LATIN_FONTS.map(font => install(font, SCORE_LATIN_FONT)),
    install(BRAVURA_FONTS[0], SCORE_MUSIC_FONT), ...(cjk ? [install(cjk, SCORE_CJK_FONT)] : []),
  ])
}

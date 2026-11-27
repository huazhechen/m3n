import type { Font } from '@pdf-lib/fontkit'
import type { ScoreFontResource } from './fonts.js'
import { SCORE_CJK_FONT, SCORE_LATIN_FONT, SCORE_MUSIC_FONT, SCORE_TEXT_FONT, SCORE_TEXT_WEIGHT } from './font-family.js'
import { scoreLayoutConfig } from './score-layout-config.js'
import type { NumberedTextMeasurementCache, TextMeasurer, TextMetrics, TextStyle } from './native-measure.js'
import { fontDesignGlyphPath, fontDesignPathInk } from './font-design-path.js'

type DesignFace = { resource: ScoreFontResource; data: Uint8Array; font: Font; family: string; characters: Set<string> }
const faces = new Map<string, DesignFace>()
const pending = new Map<string, { data: Uint8Array; promise: Promise<void> }>()
let revision = 0

/** Parse the published TTF designs (the shared reader installs these same bytes). No raster or device metrics
 * enter line breaking; glyph shaping and exact curve bounds stay in font units. */
export async function prepareFontDesigns(resources: readonly (ScoreFontResource & { data: Uint8Array })[]) {
  await Promise.all(resources.map(resource => {
    const saved = pending.get(resource.file)
    if (saved?.data === resource.data) return saved.promise
    const promise = (async () => {
      const { default: fontkit } = await import('@pdf-lib/fontkit')
      const family = resource.file.startsWith('NotoSansSC') ? SCORE_CJK_FONT
        : resource.file.startsWith('Barlow') ? SCORE_LATIN_FONT : SCORE_MUSIC_FONT
      faces.set(resource.file, { resource, data: resource.data, font: fontkit.create(resource.data), family, characters: new Set(resource.characters) })
      revision++
    })().catch(error => { pending.delete(resource.file); throw error })
    pending.set(resource.file, { data: resource.data, promise })
    return promise
  }))
}

export const designTextStyle = { boldStrokeEm: .015, italicShear: Math.tan(Math.PI / 15) } as const

/** Available only after the reader's explicit font preparation. System-font
 * editor previews and injected test measurers retain their existing contract. */
export function fontDesignMeasurer(cache?: NumberedTextMeasurementCache, timings?: Record<string, number>): TextMeasurer | undefined {
  if (![SCORE_LATIN_FONT, SCORE_MUSIC_FONT, SCORE_CJK_FONT].every(family => [...faces.values()].some(face => face.family === family))) return undefined
  return new FontDesignMeasurer(cache, timings)
}

class FontDesignMeasurer implements TextMeasurer {
  readonly designMetrics = true
  constructor(private readonly cache?: NumberedTextMeasurementCache, private readonly timings?: Record<string, number>) {}
  fixedSymbol<T extends object>(key: string, create: () => T): T {
    if (this.timings) this.timings.fixedSymbolRequests = (this.timings.fixedSymbolRequests ?? 0) + 1
    const identity = `design:${revision}:${key}`, saved = this.cache?.readSymbol<T>(identity)
    if (saved) {
      if (this.timings) this.timings.fixedSymbolCacheHits = (this.timings.fixedSymbolCacheHits ?? 0) + 1
      return saved
    }
    if (this.timings) this.timings.fixedSymbolBuilds = (this.timings.fixedSymbolBuilds ?? 0) + 1
    const value = create()
    this.cache?.writeSymbol(identity, value)
    return value
  }
  measureText(text: string, style: TextStyle): TextMetrics {
    const family = style.fontFamily ?? SCORE_TEXT_FONT
    const weight = style.fontWeight ?? (family === SCORE_TEXT_FONT ? SCORE_TEXT_WEIGHT : scoreLayoutConfig.fonts.regularWeight)
    const key = `design:${revision}:${family}:${weight}:${style.fontSize}:${style.fontStyle ?? 'normal'}`
    if (this.timings) this.timings.textMeasureRequests = (this.timings.textMeasureRequests ?? 0) + 1
    const saved = this.cache?.readFont(key).get(text)
    if (saved) {
      if (this.timings) this.timings.textMeasureCacheHits = (this.timings.textMeasureCacheHits ?? 0) + 1
      return saved
    }
    if (this.timings) this.timings.textMeasureCalls = (this.timings.textMeasureCalls ?? 0) + 1
    const families = family.split(',').map(value => value.trim().replace(/^['"]|['"]$/g, ''))
    const runs: { face: DesignFace; text: string }[] = []
    for (const char of text) {
      if (/[\u200B\u2800]/u.test(char)) continue
      let face: DesignFace | undefined
      for (const name of families) {
        face = [...faces.values()].find(face => face.family === name && face.characters.has(char))
        if (face) break
      }
      // Match the published three-font policy; never ask the OS for a fallback.
      face ??= [...faces.values()].find(face => face.characters.has(char))
      if (!face || !face.font.hasGlyphForCodePoint(char.codePointAt(0)!)) throw new Error(`乐谱设计字体缺少字符：${char}`)
      const previous = runs.at(-1)
      if (previous?.face === face) previous.text += char
      else runs.push({ face, text: char })
    }
    let advance = 0, left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
    const shear = style.fontStyle === 'italic' ? designTextStyle.italicShear : 0
    for (const { face, text } of runs) {
      const run = face.font.layout(text), scale = style.fontSize / face.font.unitsPerEm
      let x = 0, y = 0
      for (const [index, glyph] of run.glyphs.entries()) {
        const position = run.positions[index]!, bounds = fontDesignPathInk(fontDesignGlyphPath(glyph), shear)
        if (bounds) {
          const origin = advance + (x + position.xOffset + shear * (y + position.yOffset)) * scale
          const x0 = origin + bounds.left * scale
          const x1 = origin + bounds.right * scale
          const y0 = -(y + position.yOffset + bounds.bottom) * scale
          const y1 = -(y + position.yOffset + bounds.top) * scale
          left = Math.min(left, x0)
          right = Math.max(right, x1)
          top = Math.min(top, y0); bottom = Math.max(bottom, y1)
        } else if (glyph.codePoints.some(code => !/\s/u.test(String.fromCodePoint(code)))) throw new Error(`乐谱字体轮廓缺失：${face.resource.file} glyph ${glyph.id}`)
        x += position.xAdvance; y += position.yAdvance
      }
      advance += x * scale
    }
    if (!Number.isFinite(left)) left = right = top = bottom = 0
    const stroke = weight >= scoreLayoutConfig.fonts.boldWeight ? style.fontSize * designTextStyle.boldStrokeEm / 2 : 0
    left -= stroke; right += stroke; top -= stroke; bottom += stroke
    const value = { w: Math.max(advance, style.fontSize * .25), h: bottom - top, baseline: -top, advance,
      inkLeft: left, inkRight: right, centerOffset: (left + right - advance) / 2 }
    return this.cache?.write(key, text, value) ?? Object.freeze(value)
  }
}

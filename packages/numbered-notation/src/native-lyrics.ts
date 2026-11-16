import { nativeStyle } from './native-style.js'
import type { NativeLane, NativeSystem } from './native-layout.js'
import type { NativeGlyph } from './native-model.js'
import type { TextMeasurer } from './native-measure.js'
import { NativeSymbols, attrs, line } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'
import type { LyricRowData } from './lyrics.js'

// Align the spoken text to its note. Opening and closing punctuation is
// painted and measured, but does not move the word's alignment centre.
const lyricPunctuation = new Set("（([［｛〈《「『【〔〖〘〚‘“，。！？；：、,.!?;:）)]］｝〉》」』】〕〗〙〛’”\"'…—–")
function lyricParts(text: string) {
  let start = 0, end = text.length
  while (start < end && lyricPunctuation.has(text[start]!)) start++
  while (end > start && lyricPunctuation.has(text[end - 1]!)) end--
  return { prefix: text.slice(0, start), body: text.slice(start, end) }
}

function lyricFragment(data: LyricRowData, x: number, baseline: number, measurer: TextMeasurer, meta: Record<string, string | number | undefined> = {}) {
  const text = data.texts.join(''), painter = new NativeSymbols(measurer), size = nativeStyle.lyric
  const measure = (value: string) => measurer.measureText(value, { fontSize: size, fontFamily: 'serif' })
  const advance = (value: string) => { const m = measure(value); return m.advance ?? m.w }
  const { prefix, body } = lyricParts(text)
  const bodyMetrics = measurer.measureText(body, { fontSize: size, fontFamily: 'serif', textAlign: 'center' })
  const left = x - advance(body) / 2 - (bodyMetrics.centerOffset ?? 0) - advance(prefix)
  let svg = painter.text(text || '\u200B', left, baseline, size, 'serif', { ...meta, 'data-m3n-role': 'lyric', 'data-m3n-underlined': data.underlined ? 'true' : undefined })
  const metrics = measure(text)
  if (data.underlined) {
    const stroke = size * (0.8 / 18.04), y = baseline + metrics.h - metrics.baseline + size * 0.1 + stroke / 2
    const ink = nativeSvgInk(svg, measurer)
    svg += line(ink.left, y, ink.right, y, stroke)
  }
  if (data.annotation) svg += painter.text(data.annotation, left - size * 0.2, baseline, size, 'serif', { ...meta, 'text-anchor': 'end', 'data-m3n-role': 'lyric-prefix' })
  return svg
}

/** The same fragment supplies horizontal reservation and the final painting. */
export function nativeLyricInk(data: LyricRowData, measurer: TextMeasurer) {
  // Empty alignment slots remain semantic objects without visible ink.
  if (!data.texts.join('') && !data.annotation) return { left: 0, right: 0, top: 0, bottom: 0 }
  const ink = nativeSvgInk(lyricFragment(data, 0, 0, measurer), measurer)
  const text = data.texts.join(''), size = nativeStyle.lyric
  const advance = (value: string) => { const m = measurer.measureText(value, { fontSize: size, fontFamily: 'serif' }); return m.advance ?? m.w }
  const { prefix, body } = lyricParts(text)
  const left = -advance(body) / 2 - advance(prefix)
  // Measured advances retain the font's side bearings. Ink alone would
  // squeeze CJK characters whose contours occupy less than their advance.
  return { ...ink, left: Math.min(ink.left, left - (data.annotation ? size * 0.2 + advance(data.annotation) : 0)),
    right: Math.max(ink.right, left + advance(text)) }
}

export function nativeLyricSvg(glyph: NativeGlyph, row: number, baseline: number, system: number, measurer: TextMeasurer): string {
  const data = glyph.lyrics.get(row)!
  const meta = { 'data-m3n-id': glyph.xmlId, 'data-m3n-rendition': row + 1, 'data-m3n-passes': [...(data.passes ?? [row + 1])].join('-'), 'data-m3n-system': system, 'data-m3n-measure': glyph.measureId }
  return `<g${attrs({ ...meta, 'data-m3n-role': 'lyric-fragment' })}>${lyricFragment(data, glyph.x, baseline, measurer, meta)}</g>`
}

/** Actual text/prefix/underline extents determine row baselines and total height. */
export function placeNativeLyrics(system: NativeSystem, lane: NativeLane, measurer: TextMeasurer) {
  const glyphs = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs)).filter(g => g.lane === lane.id)
  let bottom = lane.lyricBottom ?? lane.bodyBottom ?? 0
  lane.lyricBaselines = new Map()
  for (const [index, row] of lane.rows.entries()) {
    const boxes = glyphs.filter(g => g.lyrics.has(row)).map(g => nativeSvgInk(nativeLyricSvg(g, row, 0, system.index, measurer), measurer))
    const top = Math.min(...boxes.map(b => b.top)), height = Math.max(...boxes.map(b => b.bottom)) - top
    const y = bottom + nativeStyle.music * (index ? 0.24 : 0.32) - top
    lane.lyricBaselines.set(row, y)
    bottom = y + top + height
  }
  lane.bottom = Math.max(lane.bodyBottom ?? 0, bottom)
}

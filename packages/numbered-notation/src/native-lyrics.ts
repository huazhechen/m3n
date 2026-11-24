import { SCORE_TEXT_FONT, SCORE_TEXT_WEIGHT } from './font-family.js'
import { nativeStyle } from './native-style.js'
import type { NativeLane, NativeSystem } from './native-layout.js'
import type { NativeGlyph } from './native-model.js'
import type { TextMeasurer } from './native-measure.js'
import { NativeSymbols, attrs, line } from './native-symbols.js'
import { nativeSvgNumber as n } from './native-svg-number.js'
import { nativeSvgInk, unionNativeInk, type NativeInk } from './native-ink.js'
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

function lyricPlacement(data: LyricRowData, x: number, measurer: TextMeasurer) {
  const text = data.texts.join(''), size = nativeStyle.lyric
  const visible = Boolean(text.replaceAll('\u200B', '').trim())
  const { prefix, body } = lyricParts(text)
  const bodyMetrics = measurer.measureText(body, { fontSize: size, fontFamily: SCORE_TEXT_FONT, textAlign: 'center' })
  const prefixMetrics = prefix ? measurer.measureText(prefix, { fontSize: size, fontFamily: SCORE_TEXT_FONT }) : undefined
  const left = x - (bodyMetrics.advance ?? bodyMetrics.w) / 2 - (bodyMetrics.centerOffset ?? 0) - (prefixMetrics ? prefixMetrics.advance ?? prefixMetrics.w : 0)
  return { text, visible, left }
}

function lyricFragment(data: LyricRowData, x: number, baseline: number, measurer: TextMeasurer, meta: Record<string, string | number | undefined> = {}) {
  const { text, visible, left } = lyricPlacement(data, x, measurer)
  if (!visible && !data.annotation) return ''
  const painter = new NativeSymbols(measurer), size = nativeStyle.lyric
  let svg = visible ? painter.text(text, left, baseline, size, SCORE_TEXT_FONT, { ...meta, 'data-m3n-role': 'lyric', 'data-m3n-underlined': data.underlined ? 'true' : undefined }) : ''
  if (data.underlined && visible) {
    const metrics = measurer.measureText(text, { fontSize: size, fontFamily: SCORE_TEXT_FONT })
    const stroke = size * (0.8 / 18.04), y = baseline + metrics.h - metrics.baseline + size * 0.1 + stroke / 2
    const ink = nativeSvgInk(svg, measurer)
    svg += line(ink.left, y, ink.right, y, stroke)
  }
  if (data.annotation) svg += painter.text(data.annotation, left - size * 0.2, baseline, size, SCORE_TEXT_FONT, { ...meta, 'text-anchor': 'end', 'data-m3n-role': 'lyric-prefix' })
  return svg
}

const unionLyricPieces = (pieces: NativeInk[]) => pieces.length ? unionNativeInk(pieces) : { left: 0, right: 0, top: 0, bottom: 0 }
/** Painted lyric primitives directly from the painter's text/line geometry.
 * Round coordinates exactly as SVG serialization does; interaction attributes
 * have no ink and need not be emitted and parsed during layout. */
export function nativeLyricPieces(data: LyricRowData, x: number, baseline: number, measurer: TextMeasurer): NativeInk[] {
  if (!data.texts.some(text => text.replaceAll('\u200B', '').trim()) && !data.annotation) return []
  const { text, visible, left } = lyricPlacement(data, x, measurer), size = nativeStyle.lyric
  const textInk = (value: string, at: number, end = false): NativeInk => {
    const metrics = measurer.measureText(value, { fontSize: n(size), fontFamily: SCORE_TEXT_FONT, fontWeight: SCORE_TEXT_WEIGHT, fontStyle: 'normal' })
    const origin = n(at) - (end ? metrics.advance ?? metrics.w : 0)
    return { left: origin + (metrics.inkLeft ?? 0), right: origin + (metrics.inkRight ?? metrics.w),
      top: n(baseline) - metrics.baseline, bottom: n(baseline) - metrics.baseline + (metrics.inkBottom ?? metrics.h) }
  }
  const pieces: NativeInk[] = []
  if (visible) {
    const ink = textInk(text, left)
    pieces.push(ink)
    if (data.underlined) {
      const metrics = measurer.measureText(text, { fontSize: size, fontFamily: SCORE_TEXT_FONT })
      const stroke = size * (0.8 / 18.04), half = n(stroke) / 2
      const y = n(baseline + metrics.h - metrics.baseline + size * 0.1 + stroke / 2)
      pieces.push({ left: n(ink.left) - half, right: n(ink.right) + half, top: y - half, bottom: y + half })
    }
  }
  if (data.annotation) pieces.push(textInk(data.annotation, left - size * 0.2, true))
  return pieces
}

/** The same fragment supplies horizontal reservation and the final painting. */
export function nativeLyricInk(data: LyricRowData, measurer: TextMeasurer) {
  // Empty alignment slots remain semantic objects without visible ink.
  if (!data.texts.some(text => text.replaceAll('\u200B', '').trim()) && !data.annotation) return { left: 0, right: 0, top: 0, bottom: 0 }
  const ink = unionLyricPieces(nativeLyricPieces(data, 0, 0, measurer))
  const text = data.texts.join(''), size = nativeStyle.lyric
  const advance = (value: string) => { const m = measurer.measureText(value, { fontSize: size, fontFamily: SCORE_TEXT_FONT }); return m.advance ?? m.w }
  const { prefix, body } = lyricParts(text)
  const left = -advance(body) / 2 - (prefix ? advance(prefix) : 0)
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

/** Pack the rows present at each musical slot into measured visual tiers.
 * Verse numbers remain semantic: missing verse 1 must not push verse 2 down,
 * while an explicit zero-width token still holds its place at that slot.
 * Painting and lane spacing consume these same per-glyph baselines.
 */
export function placeNativeLyrics(system: NativeSystem, lane: NativeLane, measurer: TextMeasurer) {
  const glyphs = system.measures.flatMap(m => m.columns.flatMap(c => c.glyphs)).filter(g => g.lane === lane.id)
  const tiers: {glyph:NativeGlyph;row:number}[][] = []
  const active = new Map<NativeGlyph,number[]>()
  for (const glyph of glyphs) {
    // An allocated empty slot is explicit alignment, just like a zero-width
    // token. Only an absent row entry is eligible for local collapse.
    const rows = lane.rows.filter(row => glyph.lyrics.has(row))
    active.set(glyph,rows)
    rows.forEach((row,index) => { (tiers[index] ??= []).push({glyph,row}) })
  }
  let bottom = lane.lyricBottom ?? lane.bodyBottom ?? 0
  const baselines: number[] = []
  for (const [index, tier] of tiers.entries()) {
    const boxes = tier.filter(({glyph,row}) => {
      const data = glyph.lyrics.get(row)!
      return data.annotation || data.texts.some(text => text.replaceAll('\u200B','').trim())
    }).map(({glyph,row}) => unionLyricPieces(nativeLyricPieces(glyph.lyrics.get(row)!, glyph.x, 0, measurer)))
    // A placeholder-only tier still reserves an actual font row when a lower
    // verse is present. Its invisible glyph has no ink to measure itself.
    const fallback = boxes.length ? undefined : measurer.measureText('M',{fontSize:nativeStyle.lyric,fontFamily:SCORE_TEXT_FONT})
    const top = fallback ? -fallback.baseline : Math.min(...boxes.map(b => b.top))
    const lower = fallback ? fallback.h-fallback.baseline : Math.max(...boxes.map(b => b.bottom))
    const y = bottom + (index ? nativeStyle.lyricGap : nativeStyle.lyricTopGap) - top
    baselines.push(y); bottom = y+lower
  }
  // Empty slots retain their rendition metadata even when the whole system
  // has no visible text in that verse. Reuse a tier without adding blank height.
  for (const glyph of glyphs) glyph.lyricBaselines = new Map([...glyph.lyrics.keys()].sort((a, b) => a - b).map(row => [
    row, baselines[Math.max(0,active.get(glyph)!.indexOf(row))] ?? bottom,
  ]))
  lane.bottom = Math.max(lane.bodyBottom ?? 0, bottom)
}

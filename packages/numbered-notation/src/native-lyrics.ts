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

/** Pack the rows present at each musical slot into measured visual tiers.
 * Verse numbers remain semantic: missing verse 1 must not push verse 2 down,
 * while an explicit zero-width token still holds its place at that slot.
 * Painting and ossia clearance consume these same per-glyph baselines.
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
  for (const tier of tiers) {
    const boxes = tier.filter(({glyph,row}) => {
      const data = glyph.lyrics.get(row)!
      return data.annotation || data.texts.some(text => text.replaceAll('\u200B','').trim())
    }).map(({glyph,row}) => nativeSvgInk(nativeLyricSvg(glyph,row,0,system.index,measurer),measurer))
    // A placeholder-only tier still reserves an actual font row when a lower
    // verse is present. Its invisible glyph has no ink to measure itself.
    const fallback = boxes.length ? undefined : measurer.measureText('M',{fontSize:nativeStyle.lyric,fontFamily:'serif'})
    const top = fallback ? -fallback.baseline : Math.min(...boxes.map(b => b.top))
    const lower = fallback ? fallback.h-fallback.baseline : Math.max(...boxes.map(b => b.bottom))
    const y = bottom + nativeStyle.lyricGap - top
    baselines.push(y); bottom = y+lower
  }
  for (const glyph of glyphs) glyph.lyricBaselines = new Map(lane.rows.filter(row => glyph.lyrics.has(row)).map(row => [
    row, baselines[Math.max(0,active.get(glyph)!.indexOf(row))] ?? bottom,
  ]))
  lane.bottom = Math.max(lane.bodyBottom ?? 0, bottom)
}

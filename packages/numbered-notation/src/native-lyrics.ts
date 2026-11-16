import { nativeStyle } from './native-style.js'
import type { NativeLane, NativeSystem } from './native-layout.js'
import type { NativeGlyph } from './native-model.js'
import type { TextMeasurer } from './native-measure.js'
import { NativeSymbols, attrs, line } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'

export function nativeLyricSvg(glyph: NativeGlyph, row: number, baseline: number, system: number, measurer: TextMeasurer): string {
  const data = glyph.lyrics.get(row)!, text = data.texts.join(''), painter = new NativeSymbols(measurer), size = nativeStyle.music * 0.82
  const meta = { 'data-m3n-id': glyph.xmlId, 'data-m3n-rendition': row + 1, 'data-m3n-passes': [...(data.passes ?? [row + 1])].join('-'), 'data-m3n-system': system, 'data-m3n-measure': glyph.measureId }
  let svg = painter.text(text || '\u200B', glyph.x, baseline, size, 'serif', { ...meta, 'text-anchor': 'middle', 'data-m3n-role': 'lyric', 'data-m3n-underlined': data.underlined ? 'true' : undefined })
  const metrics = measurer.measureText(text, { fontSize: size, fontFamily: 'serif' }), width = metrics.w
  if (data.underlined) {
    const stroke = size * (0.8 / 18.04), y = baseline + metrics.h - metrics.baseline + size * 0.1 + stroke / 2
    svg += line(glyph.x - width / 2, y, glyph.x + width / 2, y, stroke)
  }
  if (data.annotation) svg += painter.text(data.annotation, glyph.x - width / 2 - size * (4 / 18.04), baseline, size * (12 / 18.04), 'serif', { ...meta, 'text-anchor': 'end', 'data-m3n-role': 'lyric-prefix' })
  return `<g${attrs({ ...meta, 'data-m3n-role': 'lyric-fragment' })}>${svg}</g>`
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

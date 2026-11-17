import type { NativeSystem } from './native-layout.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeBarSvg, nativeLaneBarPositions } from './native-bars.js'
import { nativeSvgInk } from './native-ink.js'
import { nativeInnerMark } from './native-marks.js'
import { nativeBeamLayout } from './native-music.js'

type Extent = { top: number; bottom: number }
type Envelopes = Map<string, Extent>
const key = (paragraph: string, lane: string) => `${paragraph}:${lane}`
function include(envelopes: Envelopes, id: string, top: number, bottom: number) {
  const previous = envelopes.get(id)
  envelopes.set(id, { top: Math.max(0, top, previous?.top ?? 0), bottom: Math.max(0, bottom, previous?.bottom ?? 0) })
}

/** Capture hosts before outer expressions and relations enlarge their envelopes.
 * A mixed-paragraph row must not give every paragraph its tallest host. */
export function nativeUniformHosts(systems: NativeSystem[], measurer: TextMeasurer): Envelopes {
  const hosts: Envelopes = new Map()
  for (const system of systems) for (const [index, measure] of system.measures.entries()) {
    for (const lane of system.lanes) {
      const glyphs = measure.columns.flatMap(column => column.glyphs).filter(glyph => glyph.lane === lane.id)
      for (const glyph of glyphs) include(hosts, key(glyph.paragraph, lane.id), glyph.top, glyph.bottom)
      // A boundary belongs to the music immediately preceding it; an opening
      // repeat belongs to the first host. Neither creates a paragraph of its own.
      for (const bar of nativeLaneBarPositions(system.measures, index, lane.id)) {
        const glyph = bar.kind === 'rptstart' ? glyphs[0] : glyphs.at(-1)
        if (!glyph) continue
        const ink = nativeSvgInk(nativeBarSvg(bar.kind, bar.x, 0, measurer), measurer)
        include(hosts, key(glyph.paragraph, lane.id), -ink.top, ink.bottom)
      }
    }
  }
  return hosts
}

/** Share attachments across all paragraphs present on a row. Volta rows share
 * their attachment upper edge separately, while ordinary host height and the
 * lower edge remain shared with rows outside the ending. Lyrics/headings are
 * deliberately placed after this pass and stay local. */
export function shareNativeUniformHeight(systems: NativeSystem[], hosts: Envelopes, measurer: TextMeasurer) {
  const ordinary: Envelopes = new Map(hosts), endings: Envelopes = new Map()
  const paragraphs = systems.map(system => new Set(system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs.map(glyph => glyph.paragraph)))))
  for (const [index, system] of systems.entries()) for (const lane of system.lanes) {
    let top = 0, bottom = 0
    const add = (upper: number, lower: number) => { top = Math.max(top, upper); bottom = Math.max(bottom, lower) }
    const svg = (source: string) => { const ink = nativeSvgInk(source, measurer); add(-ink.top, ink.bottom) }
    for (const measure of system.measures) {
      const glyphs = measure.columns.flatMap(column => column.glyphs).filter(glyph => glyph.lane === lane.id).map(glyph => ({ ...glyph, y: 0 }))
      const beams = nativeBeamLayout(glyphs, measurer)
      if (beams.svg) svg(beams.svg)
    }
    for (const measure of system.measures) for (const column of measure.columns) for (const glyph of column.glyphs) {
      if (glyph.lane !== lane.id) continue
      for (const mark of glyph.markLayout ?? []) if (!nativeInnerMark(mark.name)) add(-mark.top, mark.top + mark.height)
      for (const annotation of glyph.annotationLayout ?? []) if (annotation.kind === 'chord') add(annotation.top, annotation.height - annotation.top)
    }
    for (const [relation, placement] of system.relationLayout ?? []) if (relation.first.lane === lane.id) add(-placement.ink.top, placement.ink.bottom)
    for (const decoration of system.decorationLayout ?? []) if (decoration.lane === lane.id) svg(decoration.svg)
    if (lane.id === 'melody') for (const volta of system.voltas ?? []) svg(volta.svg)
    for (const paragraph of paragraphs[index]!) {
      const id = key(paragraph, lane.id)
      include(ordinary, id, system.volta ? 0 : top, bottom)
      if (system.volta) include(endings, id, top, bottom)
    }
  }
  for (const [id, extent] of ordinary) include(endings, id, extent.top, extent.bottom)
  for (const [index, system] of systems.entries()) for (const lane of system.lanes) {
    for (const paragraph of paragraphs[index]!) {
      const extent = (system.volta ? endings : ordinary).get(key(paragraph, lane.id))
      if (!extent) continue
      lane.top = Math.max(lane.top, extent.top)
      lane.bodyBottom = Math.max(lane.bodyBottom ?? lane.bottom, extent.bottom)
    }
    lane.lyricBottom = lane.bodyBottom
  }
}

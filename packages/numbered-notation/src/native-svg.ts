import { isNativeMeasureNumber } from './native-system-labels.js'
import { scoreSvgFontFamilies } from './font-family.js'
import { nativeBarSvg, nativeLaneBarPositions, nativeMeasureBarPositions } from './native-bars.js'
import { nativeVoiceConnectorSvg } from './native-voice-connector.js'
import { nativeLyricSvg } from './native-lyrics.js'
import { NativeMusicPainter, nativeBeamLayout } from './native-music.js'
import { nativeAnnotationSvg } from './native-annotations.js'
import { attrs, n } from './native-symbols.js'
import { numberFontCss } from './number-font-css.js'
import { type NativeLayout, type NativeLane, type NativeSystem } from './native-layout-model.js'
import type { NativeGlyph, NativeMeasure } from './native-model.js'

class SvgPainter extends NativeMusicPainter {
  constructor(private readonly layout: NativeLayout) { super(layout.measurer) }

  glyph(glyph: NativeGlyph, system: NativeSystem, lane: NativeLane, claimedBeams?: ReadonlySet<number>): string {
    const music = this.music(glyph, claimedBeams), role = glyph.sustain ? 'sustain' : undefined
    const group = `<g${attrs({ class: 'note', id: glyph.id, 'data-m3n-id': glyph.xmlId, 'data-m3n-tuplet-slot': glyph.event?.kind === 'tuplet' ? glyph.slot : undefined, 'data-m3n-role': role, 'data-m3n-system': system.index, 'data-m3n-measure': glyph.measureId, 'data-m3n-passes': glyph.passes?.join('-') })}>${music}</g>`
    const annotations: string[] = []
    for (const annotation of glyph.annotationLayout ?? []) {
      annotations.push(nativeAnnotationSvg(annotation, lane.y, this, { 'data-m3n-id': glyph.xmlId, 'data-m3n-tuplet-slot': glyph.event?.kind === 'tuplet' ? glyph.slot : undefined, 'data-m3n-system': system.index, 'data-m3n-measure': glyph.measureId }))
    }
    const lyrics: string[] = []
    for (const [row, baseline] of glyph.lyricBaselines ?? []) if (glyph.lyrics.has(row)) lyrics.push(nativeLyricSvg(glyph, row, lane.y + baseline, system.index, this.layout.measurer))
    let controls = '', cursor = glyph.x - glyph.left - glyph.controls.reduce((sum, control) => sum + control.width, 0)
    for (const control of glyph.controls) {
      const x = control.x ?? cursor
      const mark = this.control(control, x, glyph.y)
      controls += `<g${attrs({ 'data-m3n-role': 'control', 'data-m3n-control': control.kind, 'data-m3n-id': glyph.xmlId })}>${mark}</g>`
      cursor += control.width
    }
    return group + controls + annotations.join('') + lyrics.join('')
  }

  measure(measure: NativeMeasure, system: NativeSystem): string {
    let content = ''
    const index = system.measures.indexOf(measure)
    const glyphs = measure.columns.flatMap(column => column.glyphs)
    for (const lane of system.lanes) {
      const members = glyphs.filter(glyph => glyph.lane === lane.id)
      if (!members.length) continue
      const beams = nativeBeamLayout(members, this.layout.measurer)
      let laneContent = members.map(glyph => this.glyph(glyph, system, lane, beams.claimed.get(glyph))).join('')
      if (beams.svg) laneContent += `<g data-m3n-role="beam">${beams.svg}</g>`
      for (const bar of nativeLaneBarPositions(system.measures, index, lane.id)) laneContent += nativeBarSvg(bar.kind, bar.x, lane.y, this.layout.measurer)
      content += `<g${attrs({ 'data-m3n-lane': lane.id })}>${laneContent}</g>`
    }
    // Elastic space after a closing bar belongs to the following interaction
    // region. An opening repeat owns its own left edge; reset on every row.
    const previous = system.measures[index - 1]
    const opening = nativeMeasureBarPositions(system.measures, index).some(bar => bar.kind === 'rptstart')
    const start = previous && !opening ? Math.min(measure.start, previous.end) : measure.start
    return `<g${attrs({ class: 'measure', id: measure.continuation ? `${measure.id}-s${system.index}` : measure.id, 'data-m3n-measure-id': measure.id, 'data-m3n-measure-start': start, 'data-m3n-measure-end': measure.end })}>${content}</g>`
  }

  system(system: NativeSystem): string {
    let svg = system.measures.map(measure => this.measure(measure, system)).join('')
    for (const relation of system.relations) svg += `<g${attrs({ 'data-m3n-lane': relation.first.lane, 'data-m3n-relation': relation.kind, transform: `translate(0 ${n(system.lanes.find(lane => lane.id === relation.first.lane)!.y)})` })}>${system.relationLayout?.get(relation)?.svg ?? ''}</g>`
    for (const volta of system.voltas ?? []) {
      const lane = system.lanes.find(lane => lane.id === 'melody')!
      svg += `<g data-m3n-lane="melody" data-m3n-relation="volta" transform="translate(0 ${n(lane.y)})">${volta.svg}</g>`
    }
    svg += nativeVoiceConnectorSvg(system, this.layout.margin, this.layout.measurer)
    for (const decoration of [...(system.decorationLayout ?? [])].filter(decoration => !decoration.hidden).sort((a, b) => Number(isNativeMeasureNumber(a)) - Number(isNativeMeasureNumber(b)))) svg += `<g${attrs({ 'data-m3n-lane': decoration.lane, transform: `translate(0 ${n(system.lanes.find(lane => lane.id === decoration.lane)!.y)})` })}>${decoration.svg}</g>`
    const boundaryInk = this.layout.verticalBlocks[this.layout.headerBlocks.length + system.index]?.boundaryInk ?? []
    const pageTop = system.top + Math.min(0, ...boundaryInk.map(piece => piece.top))
    const paragraphs = [...new Set(system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs.map(glyph => glyph.paragraph))))]
    return `<g${attrs({ class: 'system', id: `m3n-system-${system.page + 1}-${system.index}`, 'data-m3n-volta': String(system.volta), 'data-m3n-paragraph': paragraphs.join(','), 'data-m3n-top': pageTop, 'data-m3n-bottom': system.bottom })}>${svg}</g>`
  }
}

export function renderNativePages(layout: NativeLayout): string[] {
  const painter = new SvgPainter(layout)
  try {
    return layout.pages.map(page => {
      // Keep the measured page and all music positions intact. An integral
      // continuous viewport avoids CSS quantization scaling the entire score.
      const height = layout.options.paged ? n(page.height) : Math.ceil(n(page.height))
      return scoreSvgFontFamilies(`<svg${attrs({ xmlns: 'http://www.w3.org/2000/svg', width: page.width, height, viewBox: `0 0 ${n(page.width)} ${height}`, 'data-engine': 'm3n', role: 'img', 'aria-label': layout.document.title || '简谱' })}><defs><style>${numberFontCss}</style></defs><rect width="100%" height="100%" fill="#fff"/>${page.header ?? ''}${page.systems.map(system => painter.system(system)).join('')}</svg>`, layout.options.systemCjk)
    })
  } finally { painter.dispose() }
}

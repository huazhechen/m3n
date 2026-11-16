import { nativeBarSvg, nativeMeasureBarPositions } from './native-bars.js'
import { nativeVoiceConnectorSvg } from './native-voice-connector.js'
import { nativeLyricSvg } from './native-lyrics.js'
import { NativeMusicPainter, nativeBeamSvg } from './native-music.js'
import { nativeAnnotationSvg } from './native-annotations.js'
import { attrs, n } from './native-symbols.js'
import { NUMBER_FONT_CSS } from './font-data.js'
import { type NativeLayout, type NativeLane, type NativeSystem } from './native-layout.js'
import type { NativeGlyph, NativeMeasure } from './native-model.js'

class SvgPainter extends NativeMusicPainter {
  constructor(private readonly layout: NativeLayout) { super(layout.measurer) }

  glyph(glyph: NativeGlyph, system: NativeSystem, lane: NativeLane): string {
    const music = this.music(glyph), role = glyph.sustain ? 'sustain' : undefined
    const group = `<g${attrs({ class: 'note', id: glyph.id, 'data-m3n-id': glyph.xmlId, 'data-m3n-role': role, 'data-m3n-system': system.index, 'data-m3n-measure': glyph.measureId, 'data-m3n-passes': glyph.passes?.join('-') })}>${music}</g>`
    const annotations: string[] = []
    for (const annotation of glyph.annotationLayout ?? []) {
      annotations.push(nativeAnnotationSvg(annotation, lane.y, this, { 'data-m3n-id': glyph.xmlId, 'data-m3n-system': system.index, 'data-m3n-measure': glyph.measureId }))
    }
    const lyrics: string[] = []
    for (const [row, baseline] of lane.lyricBaselines ?? []) if (glyph.lyrics.has(row)) lyrics.push(nativeLyricSvg(glyph, row, lane.y + baseline, system.index, this.layout.measurer))
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
    const bars = nativeMeasureBarPositions(system.measures, system.measures.indexOf(measure))
    const glyphs = measure.columns.flatMap(column => column.glyphs)
    for (const lane of system.lanes) {
      const members = glyphs.filter(glyph => glyph.lane === lane.id)
      if (!members.length) continue
      let laneContent = members.map(glyph => this.glyph(glyph, system, lane)).join('')
      if (!lane.id.startsWith('alternative:')) {
        for (const bar of bars) laneContent += nativeBarSvg(bar.kind, bar.x, lane.y)
      }
      content += `<g${attrs({ 'data-m3n-lane': lane.id })}>${laneContent}</g>`
    }
    return `<g${attrs({ class: 'measure', id: measure.continuation ? `${measure.id}-s${system.index}` : measure.id, 'data-m3n-measure-id': measure.id, 'data-m3n-measure-start': measure.start, 'data-m3n-measure-end': measure.end })}>${content}</g>`
  }

  system(system: NativeSystem): string {
    let svg = system.measures.map(measure => this.measure(measure, system)).join('')
    // Join short-note underlines according to the active meter's beat grid.
    for (const measure of system.measures) for (const lane of system.lanes) {
      const glyphs = measure.columns.flatMap(column => column.glyphs).filter(glyph => glyph.lane === lane.id)
      for (let index = 1; index < glyphs.length; index++) {
        const a = glyphs[index - 1]!, b = glyphs[index]!
        const beam = nativeBeamSvg(a, b)
        if (beam) svg += `<g${attrs({ 'data-m3n-lane': lane.id, 'data-m3n-role': 'beam' })}>${beam}</g>`
      }
    }
    for (const relation of system.relations) svg += `<g${attrs({ 'data-m3n-lane': relation.first.lane, 'data-m3n-relation': relation.kind, transform: `translate(0 ${n(system.lanes.find(lane => lane.id === relation.first.lane)!.y)})` })}>${system.relationLayout?.get(relation)?.svg ?? ''}</g>`
    for (const volta of system.voltas ?? []) {
      const lane = system.lanes.find(lane => lane.id === 'melody')!
      svg += `<g data-m3n-lane="melody" data-m3n-relation="volta" transform="translate(0 ${n(lane.y)})">${volta.svg}</g>`
    }
    for (const decoration of system.decorationLayout ?? []) svg += `<g${attrs({ 'data-m3n-lane': decoration.lane, transform: `translate(0 ${n(system.lanes.find(lane => lane.id === decoration.lane)!.y)})` })}>${decoration.svg}</g>`
    svg += nativeVoiceConnectorSvg(system, this.layout.margin)
    const paragraphs = [...new Set(system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs.map(glyph => glyph.paragraph))))]
    return `<g${attrs({ class: 'system', id: `m3n-system-${system.page + 1}-${system.index}`, 'data-m3n-volta': String(system.volta), 'data-m3n-paragraph': paragraphs.join(','), 'data-m3n-top': system.top, 'data-m3n-bottom': system.bottom })}>${svg}</g>`
  }
}

export function renderNativePages(layout: NativeLayout): string[] {
  const painter = new SvgPainter(layout)
  try {
    return layout.pages.map(page => `<svg${attrs({ xmlns: 'http://www.w3.org/2000/svg', width: page.width, height: page.height, viewBox: `0 0 ${page.width} ${page.height}`, 'data-engine': 'm3n', role: 'img', 'aria-label': layout.document.title || '简谱' })}><defs><style>${NUMBER_FONT_CSS}</style></defs><rect width="100%" height="100%" fill="#fff"/>${page.header ?? ''}${page.systems.map(system => painter.system(system)).join('')}</svg>`)
  } finally { painter.dispose() }
}

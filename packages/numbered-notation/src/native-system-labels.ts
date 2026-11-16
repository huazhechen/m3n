import { nativeStyle, nativeEm as em } from './native-style.js'
import type { NativeSystem } from './native-layout.js'
import type { NativeRegion } from './native-annotations.js'
import type { TextMeasurer } from './native-measure.js'
import { NativeSymbols, n } from './native-symbols.js'
import { nativeSvgInk } from './native-ink.js'

export function placeNativeNavigation(system: NativeSystem, measurer: TextMeasurer) {
  const painter = new NativeSymbols(measurer), lane = system.lanes.find(l => l.id === 'melody')
  if (!lane) return
  for (const measure of system.measures) if (measure.lastFragment) for (const mark of measure.navigation ?? []) {
    const svg = painter.text(mark.text, mark.x ?? measure.end - em(19), -nativeStyle.music * 0.3 + mark.size * 0.3, mark.size, '"Times New Roman", serif', { 'data-m3n-role': 'navigation' })
    const ink = nativeSvgInk(svg, measurer)
    lane.top = Math.max(lane.top, -ink.top); lane.bodyBottom = Math.max(lane.bodyBottom ?? 0, ink.bottom)
    lane.lyricBottom = Math.max(lane.lyricBottom ?? 0, ink.bottom)
    system.decorationLayout ??= []; system.decorationLayout.push({ lane: lane.id, svg })
  }
}

export function placeNativeSystemLabels(system: NativeSystem, regions: NativeRegion[], measurer: TextMeasurer, measureNumbers: boolean) {
  const painter = new NativeSymbols(measurer)
  const place = (laneId: string, svg: string, size: number) => {
    const ink = nativeSvgInk(svg, measurer), lane = system.lanes.find(l => l.id === laneId)!
    const top = Math.max(0, ...regions.filter(r => r.lane === laneId && r.right >= ink.left && r.left <= ink.right).map(r => r.top))
    const y = -top - size * 0.4 - ink.bottom, measuredTop = -(y + ink.top)
    lane.top = Math.max(lane.top, measuredTop)
    regions.push({ lane: laneId, left: ink.left, right: ink.right, top: measuredTop })
    system.decorationLayout ??= []; system.decorationLayout.push({ lane: laneId, svg: `<g transform="translate(0 ${n(y)})">${svg}</g>` })
  }
  for (const measure of system.measures) {
    const glyphs = measure.columns.flatMap(c => c.glyphs), first = glyphs.find(g => g.lane === 'melody')
    if (measureNumbers && !measure.continuation && first) place('melody', painter.text(String(measure.index + 1), Math.max(measure.start + em(2), first.x - first.left), 0, nativeStyle.measureNumber, 'serif', { 'data-m3n-role': 'annotation', 'data-m3n-id': first.xmlId }), nativeStyle.measureNumber)
    if (measure.lastFragment && (measure.source.repeatCount ?? 2) > 2) place('melody', painter.text(`×${measure.source.repeatCount}`, measure.end - em(3), 0, nativeStyle.small, 'serif', { 'text-anchor': 'end' }), nativeStyle.small)
    for (const lane of system.lanes.filter(l => l.id.startsWith('alternative:'))) {
      const member = glyphs.find(g => g.lane === lane.id)
      if (member && member.passes?.join(',') !== '2') place(lane.id, painter.text(`${member.passes?.join('.')}.`, member.x, 0, nativeStyle.small), nativeStyle.small)
    }
  }
}

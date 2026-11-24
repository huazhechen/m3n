import { Stem, type Beam } from 'vexflow/bravura'
import { element, setNumericPath, type Ink, type XmlNode } from './layout-svg.js'
import { staffCommandPath, type StaffNumericPath, type StaffPathCommand } from './staff-glyph-primitive.js'

/** Same pinned VexFlow stem/beam geometry; candidate work emits numeric ink.
 * Materialize its groups and SVG attributes only when the score is rendered. */
export function drawStaffBeam(beam: Beam): XmlNode[] {
  const state = beam as unknown as { unbeamable: boolean; slope: number }
  if (state.unbeamable) return []
  beam.postFormat()
  const stems: StaffNumericPath[] = [], beams: StaffNumericPath[] = [], ink: Ink[] = []
  const append = (target: StaffNumericPath[], commands: StaffPathCommand[], half = 0) => {
    const path = staffCommandPath(commands)
    target.push(path)
    for (const box of path.boxes) ink.push({ left: box.left - half, right: box.right + half, top: box.top - half, bottom: box.bottom + half })
  }
  for (const note of beam.notes) {
    const stem = note.getStem()
    if (!stem) continue
    const x = note.getStemX()
    stem.setNoteHeadXBounds(x, x)
    const s = stem as unknown as { hide: boolean; stem_direction: number; y_top: number; y_bottom: number; stem_down_y_offset: number; stem_up_y_offset: number; stem_down_y_base_offset: number; stem_up_y_base_offset: number; isStemlet: boolean; stemletHeight: number; renderHeightAdjustment: number }
    if (s.hide) continue
    const down = s.stem_direction === Stem.DOWN
    const y = down ? s.y_top + s.stem_down_y_offset : s.y_bottom - s.stem_up_y_offset
    const base = down ? s.stem_down_y_base_offset : s.stem_up_y_base_offset
    const height = stem.getHeight(), stemlet = s.isStemlet ? height - s.stemletHeight * s.stem_direction : 0
    append(stems, [{ kind: 0, values: [x, y - stemlet + base] }, { kind: 1, values: [x, y - height - s.renderHeightAdjustment * s.stem_direction] }], Stem.WIDTH / 2)
  }
  let y = beam.getBeamYToDraw()
  const firstX = beam.notes[0]!.getStemX(), thickness = beam.render_options.beam_width * beam.getStemDirection()
  for (const duration of ['4', '8', '16', '32', '64']) {
    for (const line of beam.getBeamLines(duration)) {
      if (!line.end) throw new Error('五线谱符杠缺少终点。')
      const top = beam.getSlopeY(line.start, firstX, y, state.slope), bottom = beam.getSlopeY(line.end, firstX, y, state.slope)
      append(beams, [{ kind: 0, values: [line.start, top] }, { kind: 1, values: [line.start, top + thickness] },
        { kind: 1, values: [line.end + 1, bottom + thickness] }, { kind: 1, values: [line.end + 1, bottom] }, { kind: 4, values: [] }])
    }
    y += thickness * 1.5
  }
  const fragment = element('g', { class: 'm3n-beam-ink' })
  fragment.numericInk = ink
  const pathNode = (path: StaffNumericPath, attributes: Record<string, string>) => {
    const node = element('path', attributes); setNumericPath(node, path); return node
  }
  fragment.renderNodes = () => [
    ...stems.map(path => element('g', { class: 'stem', 'pointer-events': 'bounding-box' }, [pathNode(path, { 'stroke-width': '1.5', fill: 'none', d: '', stroke: '#000' })])),
    element('g', { class: 'beam' }, beams.map(path => pathNode(path, { stroke: 'none' }))),
  ]
  return [fragment]
}

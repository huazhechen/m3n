import { type StaffMeasureLayout } from './staff-engine.js'
import { staffLineInk } from './staff-glyph-primitive.js'
import { appendStaffGlyphInk, staffMusicSize } from './staff-music-font.js'
import type { Ink } from './layout-svg.js'

/** Exact single-staff music subset shared by every flexible beam direction.
 * Emit only original glyph boxes and line primitives. Curves, movable marks,
 * flexible stems and beams are deliberately absent from this proof subset. */
export function staffInvariantMusicInk(models: readonly StaffMeasureLayout[]): Ink[] {
  if (models.some(model => model.staves.length !== 1)) throw new Error('Invariant music proof requires one staff')
  const size = staffMusicSize(), space = size / 4, result: Ink[] = []
  for (const model of models) {
    const staff = model.staves[0]!
    for (let index = 0; index < 5; index++) {
      const y = staff.y + size + space * index
      result.push(staffLineInk(staff.x, y, staff.x + staff.width, y, space * .1 / 2))
    }
    const flexible = new Set(model.beams.filter((_, index) => model.prepared.beams[index]!.flexible))
    for (const entry of model.entries[0]!) for (const note of entry.notes) {
      const prepared = note.prepared, unit = prepared.size / 4
      for (const head of prepared.heads)
        appendStaffGlyphInk(result, prepared.head, prepared.size, note.x + head.x,
          staff.y + head.y + (prepared.rest && prepared.dur === 1 ? -space : 0))
      for (const symbol of prepared.symbols)
        if (symbol.glyph.startsWith('accidental') || symbol.glyph === 'augmentationDot')
          appendStaffGlyphInk(result, symbol.glyph, symbol.size ?? prepared.size, note.x + symbol.x, staff.y + symbol.y)
      // Groups are fitted independently, so a fixed group's stems remain
      // unchanged when another group's legal direction is tried.
      if (!prepared.rest && prepared.dur > 1 && (!note.beam || !flexible.has(note.beam))) {
        const root = prepared.direction === 1 ? Math.max(...note.ys) - unit * .1 : Math.min(...note.ys) + unit * .1
        result.push(staffLineInk(note.stemX, root, note.stemX, note.stemEnd, unit * .1 / 2))
      }
    }
  }
  return result
}

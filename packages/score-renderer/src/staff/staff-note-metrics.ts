import { Flow, GraceNoteGroup, type StaveNote } from 'vexflow/bravura'

/** Freeze fixed glyph/font lookups on a private formatted note. Positions and
 * center alignment remain live as the candidate moves time columns/staves. */
export function prepareStaffNoteMetrics(note: StaveNote): void {
  const width = note.getGlyphWidth()
  const padding = Flow.getMusicFontStack()[0]!.lookupMetric('stave.padding')
  note.getGlyphWidth = () => width
  note.getAbsoluteX = function () {
    let x = this.getTickContext().getX()
    const stave = this.getStave()
    if (stave) x += stave.getNoteStartX() + padding
    if (this.isCenterAligned()) x += this.getCenterXShift()
    return x
  }
  for (const modifier of note.getModifiers()) if (modifier instanceof GraceNoteGroup)
    for (const grace of modifier.getGraceNotes()) prepareStaffNoteMetrics(grace as StaveNote)
}

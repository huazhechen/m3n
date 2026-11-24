import { GraceNoteGroup, type Beam, type StaveNote } from 'vexflow/bravura'
import type { VexMeasure } from './vexflow-engine.js'

type StemState = { x_begin: number; x_end: number; stem_extension: number; hide: boolean;
  isStemlet: boolean; stemletHeight: number; renderHeightAdjustment: number }

/** Fixed notes/formatting stay private to a synchronous drawing lease. Reset
 * only width-dependent engraving state: stems, beam post-formatting and
 * modifiers (including grace-group alignment and delayed ornaments). */
export function staffModelState(model: VexMeasure, drawings: WeakMap<StaveNote, unknown>): () => VexMeasure {
  const beams = new Set<Beam>(model.beams)
  const stems: Array<{ target: StemState; original: StemState }> = []
  const states: Array<{ note: StaveNote; target: object; original: object }> = []
  const visit = (note: StaveNote) => {
    const stem = note.getStem()
    if (stem) {
      // VexFlow 4.2.5 beam formatting changes these fields. Bounds belong to
      // the live stave; font offsets, direction and Element metadata are fixed.
      const target = stem as unknown as StemState
      stems.push({ target, original: { x_begin: target.x_begin, x_end: target.x_end,
        stem_extension: target.stem_extension, hide: target.hide, isStemlet: target.isStemlet,
        stemletHeight: target.stemletHeight, renderHeightAdjustment: target.renderHeightAdjustment } })
    }
    const beam = note.getBeam()
    if (beam) beams.add(beam)
    for (const modifier of note.getModifiers()) {
      states.push({ note, target: modifier, original: { ...modifier } })
      if (modifier instanceof GraceNoteGroup) for (const grace of modifier.getGraceNotes()) visit(grace as StaveNote)
    }
  }
  for (const lane of model.entries) for (const entry of lane) entry.notes.forEach(visit)
  return () => {
    for (const { target, original } of stems) {
      target.x_begin = original.x_begin; target.x_end = original.x_end
      target.stem_extension = original.stem_extension; target.hide = original.hide
      target.isStemlet = original.isStemlet; target.stemletHeight = original.stemletHeight
      target.renderHeightAdjustment = original.renderHeightAdjustment
    }
    // Recorded immutable notes no longer invoke their modifier drawers.
    // Native/grace/position-dependent modifiers still restore every field.
    for (const { note, target, original } of states) if (!drawings.get(note)) Object.assign(target, original)
    // VexFlow 4.2.5 has no public invalidation method for its beam solver.
    // All slopes/extensions must be recomputed from the current time columns.
    for (const beam of beams) (beam as unknown as { postFormatted: boolean }).postFormatted = false
    return model
  }
}

import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { staffGlyph, staffGlyphMetrics, type StaffGlyph } from './staff-music-font.js'
import { element, type MeasureText } from './layout-svg.js'

const notes: Record<number, StaffGlyph> = {
  1: 'metNoteWhole', 2: 'metNoteHalfUp', 4: 'metNoteQuarterUp',
  8: 'metNote8thUp', 16: 'metNote16thUp', 32: 'metNote32ndUp',
  64: 'metNote64thUp', 128: 'metNote128thUp',
}

/** Complete Bravura metronome notes, calibrated to numeric ink at the 28px design em.
 * Only the note and its dots/gaps follow the staff music size; numeric text stays fixed.
 * Keep one font scale across beat units so extra flags never shrink the head.
 */
export function staffTempoBeat(unit: number, dots: number, x: number, baseline: number, textSize: number, measureText: MeasureText) {
  const digits = measureText('0123456789', textSize)
  const textHeight = digits.ascent + digits.descent
  const musicHeight = textHeight * scoreLayoutConfig.staff.musicSizeRatio
  const reference = staffGlyphMetrics('metNoteQuarterUp', 1)
  const size = musicHeight * 1.25 / (reference.bottom - reference.top)
  const name = notes[unit]
  if (!name) throw new Error(`五线谱速度标记不支持音符单位：${unit}`)
  const ink = staffGlyphMetrics(name, size)
  const y = baseline + digits.descent - ink.bottom
  const node = element('g', { class: 'tempo-beat' }, [staffGlyph(name, x - ink.left, y, size)])
  let right = x + ink.right - ink.left
  const dot = staffGlyphMetrics('metAugmentationDot', size)
  for (let i = 0; i < dots; i++) {
    const left = right + musicHeight * .2
    node.children.push(staffGlyph('metAugmentationDot', left - dot.left, y, size))
    right = left + dot.right - dot.left
  }
  return { node, textX: right + musicHeight * .35 }
}

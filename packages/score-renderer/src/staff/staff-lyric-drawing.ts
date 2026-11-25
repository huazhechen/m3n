import { scoreLayoutConfig, lyricSpacing, SCORE_TEXT_FONT } from '@m3n/numbered-notation'
import { STAFF_SCALE } from './staff-engine.js'
import { element, type Ink, type FontInk, type MeasureText, type XmlNode } from './layout-svg.js'

export type StaffLyricText = { ink?: FontInk; underlineWidth?: number }
export function staffLyricDrawing(value: string, x: number, y: number, underlined: boolean, measure: MeasureText,
  templates?: Map<string, StaffLyricText>): XmlNode {
  let text = templates?.get(value)
  if (!text) {
    const content = value.replace(/[\t\r\n]/g, '').trim()
    text = { ink: content.replace(/[\u200B\u2800]/g, '') ? measure(content, lyricSpacing.fontSize / STAFF_SCALE) : undefined }
    templates?.set(value, text)
  }
  if (underlined) text.underlineWidth ??= measure(value, lyricSpacing.fontSize / STAFF_SCALE).width
  return new LyricDrawing(value, x, y, underlined ? text.underlineWidth : undefined, text.ink)
}
/** Lyrics expose their real text for verse packing and exact numeric ink for
 * avoidance. SVG attributes and underline paths are built only at output. */
class LyricDrawing implements XmlNode {
  readonly tagName = 'g'
  readonly attributes = { class: 'syl' }
  readonly children: Array<XmlNode | string> = []
  readonly numericInk: Ink[] = []
  private readonly underlineWidth?: number
  constructor(readonly textValue: string, private readonly x: number, private readonly y: number,
    underlineWidth: number | undefined, metrics: FontInk | undefined) {
    if (metrics) {
      const left = x - metrics.width / 2
      this.numericInk.push({ left: left + metrics.left, right: left + metrics.right, top: y - metrics.ascent, bottom: y + metrics.descent })
    }
    if (underlineWidth !== undefined) {
      const width = this.underlineWidth = underlineWidth
      const left = x - width / 2, right = left + width, half = scoreLayoutConfig.staff.lyricUnderlineHalfWidth / STAFF_SCALE
      this.numericInk.push({ left: Math.min(left, right) - half, right: Math.max(left, right) + half, top: y + scoreLayoutConfig.staff.engine.lyricUnderlineOffset - half, bottom: y + scoreLayoutConfig.staff.engine.lyricUnderlineOffset + half })
    }
  }
  renderNodes(): Array<XmlNode | string> {
    const text = element('text', { x: String(this.x), y: String(this.y), 'font-size': String(lyricSpacing.fontSize / STAFF_SCALE), 'font-family': SCORE_TEXT_FONT, 'text-anchor': 'middle' }, [this.textValue])
    const children = [text]
    if (this.underlineWidth !== undefined) children.push(element('path', { d: `M${this.x - this.underlineWidth / 2} ${this.y + scoreLayoutConfig.staff.engine.lyricUnderlineOffset} h${this.underlineWidth}`, stroke: '#000', 'stroke-width': String(scoreLayoutConfig.staff.lyricUnderlineHalfWidth * 2 / STAFF_SCALE), fill: 'none' }))
    return [element('g', { class: 'syl' }, children)]
  }
}

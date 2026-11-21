import { SCORE_TEXT_FONT } from '@m3n/numbered-notation'
import {
  numberedHeadingLines,
  numberedHeaderContent,
  sectionOrderLabels,
  sectionVisitKey,
  keyLabel,
  type ScoreDocument,
} from '@m3n/notation'
import { element, type XmlNode, type MeasureText, type Ink, overlapsX } from './layout-svg.js'

/** Measured page furniture, independent of the music engraving engine. */
export function staffHeader(score: ScoreDocument, width: number, measure: MeasureText, transpose = 0) {
  const content = numberedHeaderContent(score),
    children: XmlNode[] = [],
    bounds: Ink[] = []
  const measurer = {
    measureText: (text: string, style: { fontSize: number; fontWeight: number }) => ({
      w: measure(text, style.fontSize, style.fontWeight === 700).width,
    }),
  }
  const wrap = (text: string, size: number, bold = false) =>
    numberedHeadingLines(text, width - 2, size, measurer, bold ? 700 : 400)
  const put = (text: string, x: number, top: number, size: number, anchor = 'start', bold = false) => {
    const metrics = measure(text, size, bold),
      left = x - (anchor === 'middle' ? metrics.width / 2 : anchor === 'end' ? metrics.width : 0)
    const ink = {
      left: left + metrics.left,
      right: left + metrics.right,
      top,
      bottom: top + metrics.ascent + metrics.descent,
    }
    children.push(
      element(
        'text',
        {
          x: String(x),
          y: String(top + metrics.ascent),
          'font-size': String(size),
          'font-family': SCORE_TEXT_FONT,
          'text-anchor': anchor,
          ...(bold ? { 'font-weight': 'bold' } : {}),
        },
        [text],
      ),
    )
    bounds.push(ink)
    return ink
  }
  let y = 0
  for (const line of wrap(score.title, 32, true)) {
    const ink = put(line, width / 2, y, 32, 'middle', true)
    y = ink.bottom + 5
  }
  const sideTop = y
  for (const text of content.subtitles)
    for (const line of wrap(text, 16)) {
      const ink = put(line, width / 2, y, 16, 'middle')
      y = ink.bottom + 5
    }
  let creditY = sideTop
  const credits = [...content.credits, ...(score.arranger ? [`${score.arranger} 编曲`] : [])]
  for (const text of credits)
    for (const line of wrap(text, 14)) {
      const metrics = measure(line, 14),
        left = width - metrics.width
      const candidate = { left, right: width, top: creditY, bottom: creditY + metrics.ascent + metrics.descent }
      for (const obstacle of bounds)
        if (
          overlapsX(candidate, obstacle, 14) &&
          candidate.bottom + 5 > obstacle.top &&
          creditY < obstacle.bottom + 5
        ) {
          creditY = obstacle.bottom + 5
          candidate.top = creditY
          candidate.bottom = creditY + metrics.ascent + metrics.descent
        }
      const ink = put(line, width, creditY, 14, 'end')
      creditY = ink.bottom + 5
    }
  y = Math.max(y, creditY)
  const target = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][((transpose % 12) + 12) % 12]!
  const labels = sectionOrderLabels(score, (key) => keyLabel(transpose ? sectionVisitKey(key, 'C', target) : key)) ?? []
  if (labels.length) {
    let x = 0,
      rowTop = y + 12,
      rowHeight = 0
    const prefix = put('演奏顺序：', x, rowTop, 16)
    x = prefix.right + 4
    rowHeight = prefix.bottom - rowTop
    for (const [index, label] of labels.entries()) {
      // Long labels wrap inside their own frame; arrows stay vector paths.
      const lines = numberedHeadingLines(label, width - 28, 16, measurer, 700),
        metrics = lines.map((line) => measure(line, 16, true))
      const w = Math.max(...metrics.map((m) => m.width)) + 8,
        h = metrics.reduce((n, m) => n + m.ascent + m.descent + 4, 4)
      if (x + w + (index ? 20 : 0) > width && x > 0) {
        rowTop += rowHeight + 12
        x = 0
        rowHeight = 0
      }
      if (index) {
        const end = x + 14,
          middle = rowTop + 10
        children.push(
          element('path', {
            d: `M${x} ${middle} H${end} M${end - 4} ${middle - 4} L${end} ${middle} L${end - 4} ${middle + 4}`,
            stroke: '#000',
            'stroke-width': '1',
            fill: 'none',
            'data-m3n-role': 'order-arrow',
          }),
        )
        x += 20
      }
      children.push(
        element('rect', {
          x: String(x + 0.5),
          y: String(rowTop + 0.5),
          width: String(w - 1),
          height: String(h - 1),
          fill: 'none',
          stroke: '#000',
          'stroke-width': '1',
        }),
      )
      let top = rowTop + 4
      for (const line of lines) {
        const ink = put(line, x + 4, top, 16, 'start', true)
        top = ink.bottom + 4
      }
      x += w + 4
      rowHeight = Math.max(rowHeight, h)
    }
    y = rowTop + rowHeight
  }
  return { height: children.length ? y + 7 : 0, node: element('g', { 'data-m3n-role': 'header' }, children) }
}

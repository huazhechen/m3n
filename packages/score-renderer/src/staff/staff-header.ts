import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { SCORE_TEXT_FONT, SCORE_TITLE_FONT, SCORE_TITLE_WEIGHT } from '@m3n/numbered-notation'
import {
  numberedHeadingLines,
  numberedHeaderContent,
  sectionOrderLabels,
  sectionVisitKey,
  keyLabel,
  type ScoreDocument,
} from '@m3n/notation'
import { element, type XmlNode, type MeasureText, type Ink, overlapsX } from './layout-svg.js'

const style = scoreLayoutConfig.staff

/** Measured page furniture, independent of the music engraving engine. */
export function staffHeader(score: ScoreDocument, width: number, measure: MeasureText, transpose = 0) {
  const content = numberedHeaderContent(score),
    children: XmlNode[] = [],
    bounds: Ink[] = []
  const measurer = {
    measureText: (text: string, style: { fontSize: number; fontWeight: number }) => ({
      w: measure(text, style.fontSize, style.fontWeight === scoreLayoutConfig.fonts.boldWeight).width,
    }),
  }
  const wrap = (text: string, size: number, bold = false) =>
    numberedHeadingLines(text, width - style.headerWrapInset, size, measurer, bold ? scoreLayoutConfig.fonts.boldWeight : scoreLayoutConfig.fonts.regularWeight)
  const put = (text: string, x: number, top: number, size: number, anchor = 'start', bold = false, family = SCORE_TEXT_FONT) => {
    const metrics = measure(text, size, family === SCORE_TITLE_FONT ? SCORE_TITLE_WEIGHT === scoreLayoutConfig.fonts.boldWeight : bold, false, family),
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
          'font-family': family,
          'font-weight': String(scoreLayoutConfig.fonts.textWeight),
          ...(family === SCORE_TITLE_FONT ? { 'font-weight': String(SCORE_TITLE_WEIGHT), 'font-synthesis': 'none', 'data-m3n-role': 'title' } : {}),
          'text-anchor': anchor,
          ...(bold ? { 'font-weight': String(scoreLayoutConfig.fonts.boldWeight) } : {}),
        },
        [text],
      ),
    )
    bounds.push(ink)
    return ink
  }
  let y = 0
  const titleMeasurer = { measureText: (text: string, style: { fontSize: number }) => ({ w: measure(text, style.fontSize, SCORE_TITLE_WEIGHT === scoreLayoutConfig.fonts.boldWeight, false, SCORE_TITLE_FONT).width }) }
  for (const line of numberedHeadingLines(score.title, width - style.headerWrapInset, style.title, titleMeasurer, SCORE_TITLE_WEIGHT)) {
    const ink = put(line, width / 2, y, style.title, 'middle', false, SCORE_TITLE_FONT)
    y = ink.bottom + style.headerRowGap
  }
  const sideTop = y
  for (const text of content.subtitles)
    for (const line of wrap(text, style.subtitle)) {
      const ink = put(line, width / 2, y, style.subtitle, 'middle')
      y = ink.bottom + style.headerRowGap
    }
  let creditY = sideTop
  const credits = [...content.credits, ...(score.arranger ? [`${score.arranger} 编曲`] : [])]
  for (const text of credits)
    for (const line of wrap(text, style.credit)) {
      const metrics = measure(line, style.credit),
        left = width - metrics.width
      const candidate = { left, right: width, top: creditY, bottom: creditY + metrics.ascent + metrics.descent }
      for (const obstacle of bounds)
        if (
          overlapsX(candidate, obstacle, style.headerSideGap) &&
          candidate.bottom + style.headerRowGap > obstacle.top &&
          creditY < obstacle.bottom + style.headerRowGap
        ) {
          creditY = obstacle.bottom + style.headerRowGap
          candidate.top = creditY
          candidate.bottom = creditY + metrics.ascent + metrics.descent
        }
      const ink = put(line, width, creditY, style.credit, 'end')
      creditY = ink.bottom + style.headerRowGap
    }
  y = Math.max(y, creditY)
  const target = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][((transpose % 12) + 12) % 12]!
  const labels = sectionOrderLabels(score, (key) => keyLabel(transpose ? sectionVisitKey(key, 'C', target) : key)) ?? []
  if (labels.length) {
    let x = 0,
      rowTop = y + style.orderTopGap,
      rowHeight = 0
    const prefix = put('演奏顺序：', x, rowTop, style.text)
    x = prefix.right + style.orderItemGap
    rowHeight = prefix.bottom - rowTop
    for (const [index, label] of labels.entries()) {
      // Long labels wrap inside their own frame; arrows stay vector paths.
      const lines = numberedHeadingLines(label, width - style.orderArrowAdvance - 2 * style.orderFramePadding, style.text, measurer, scoreLayoutConfig.fonts.boldWeight),
        metrics = lines.map((line) => measure(line, style.text, true))
      const w = Math.max(...metrics.map((m) => m.width)) + 2 * style.orderFramePadding,
        h = metrics.reduce((n, m) => n + m.ascent + m.descent + style.orderFramePadding, style.orderFramePadding)
      if (x + w + (index ? style.orderArrowAdvance : 0) > width && x > 0) {
        rowTop += rowHeight + style.orderTopGap
        x = 0
        rowHeight = 0
      }
      if (index) {
        const end = x + style.orderArrowWidth,
          middle = rowTop + style.orderArrowHeight
        children.push(
          element('path', {
            d: `M${x} ${middle} H${end} M${end - style.orderArrowTip} ${middle - style.orderArrowTip} L${end} ${middle} L${end - style.orderArrowTip} ${middle + style.orderArrowTip}`,
            stroke: '#000',
            'stroke-width': String(style.frameStroke),
            fill: 'none',
            'data-m3n-role': 'order-arrow',
          }),
        )
        x += style.orderArrowAdvance
      }
      children.push(
        element('rect', {
          x: String(x + style.frameStroke / 2),
          y: String(rowTop + style.frameStroke / 2),
          width: String(w - style.frameStroke),
          height: String(h - style.frameStroke),
          fill: 'none',
          stroke: '#000',
          'stroke-width': String(style.frameStroke),
        }),
      )
      let top = rowTop + style.orderFramePadding
      for (const line of lines) {
        const ink = put(line, x + style.orderFramePadding, top, style.text, 'start', true)
        top = ink.bottom + style.orderFramePadding
      }
      x += w + style.orderItemGap
      rowHeight = Math.max(rowHeight, h)
    }
    y = rowTop + rowHeight
  }
  return { height: children.length ? y + style.headerBottomGap : 0, node: element('g', { 'data-m3n-role': 'header' }, children) }
}

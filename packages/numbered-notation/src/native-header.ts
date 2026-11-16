import { scoreCreditLines, type ScoreDocument } from '@m3n/notation'
import type { TextMeasurer } from './native-measure.js'
import { numberedOrderLines } from './order-lines.js'

export type NativeOrderItem = { text: string; framed: boolean; x: number; y: number; width: number; height: number; baseline: number }

export function wrapNativeText(text: string, width: number, size: number, measurer: TextMeasurer, weight = 400): string[] {
  const lines: string[] = []
  let line = ''
  for (const character of text) {
    if (character === '\n') { lines.push(line); line = ''; continue }
    if (line && measurer.measureText(line + character, { fontSize: size, fontFamily: 'serif', fontWeight: weight }).w > width) {
      const boundary = Math.max(line.lastIndexOf(' '), line.lastIndexOf('('), line.lastIndexOf('（'))
      if (boundary > 0) { lines.push(line.slice(0, boundary).trimEnd()); line = line.slice(boundary).trimStart() + character }
      else { lines.push(line); line = character.trimStart() }
    } else line += character
  }
  if (line) lines.push(line)
  return lines
}

/** Shared measured geometry for header painting and the first system's position. */
export function nativeHeaderGeometry(document: ScoreDocument, width: number, margin: number, measurer: TextMeasurer, systemGap = 24) {
  const available = width - 2 * margin
  const title = wrapNativeText(document.title, available - 2, 32, measurer, 700)
  const subtitle = wrapNativeText(document.subtitle, available - 2, 16, measurer)
  const titleHeight = title.length ? 32 + (title.length - 1) * 40 : 0
  const subtitleHeight = subtitle.length ? 16 + (subtitle.length - 1) * 20 : 0
  const centerHeight = titleHeight + subtitleHeight + (titleHeight && subtitleHeight ? 5 : 0)
  const credits = scoreCreditLines(document)
  const creditsHeight = credits.length ? 14 + (credits.length - 1) * 21 : 0
  const signaturesHeight = 39.96
  const stacked = width < 600 && creditsHeight > 0
  const sideTop = margin + centerHeight + (centerHeight ? 5 : 0)
  const sidesHeight = stacked ? creditsHeight + 5 + signaturesHeight : Math.max(creditsHeight, signaturesHeight)
  const signaturesTop = sideTop + (stacked ? creditsHeight + 5 : sidesHeight - signaturesHeight)
  const creditsTop = sideTop + (stacked ? 0 : sidesHeight - creditsHeight)
  const orderRows: { top: number; height: number; items: NativeOrderItem[] }[] = []
  let orderBottom = sideTop + sidesHeight
  for (const [index, names] of numberedOrderLines(document.order, available).entries()) {
    const labels = [{ text: index ? '→' : '演奏顺序：', framed: false }, ...names.flatMap((name, index) => [
      ...(index ? [{ text: '→', framed: false }] : []), { text: name, framed: true },
    ])]
    const measured = labels.map(item => ({ ...item, metrics: measurer.measureText(item.text, { fontSize: 16, fontFamily: 'serif', fontWeight: item.framed ? 700 : 400 }) }))
    const height = Math.max(...measured.map(item => item.metrics.h + (item.framed ? 7 : 0)))
    const top = orderBottom + systemGap
    let x = margin
    const items = measured.map(item => {
      const padding = item.framed ? 3.5 : 0, itemHeight = item.metrics.h + padding * 2
      const y = top + (height - itemHeight) / 2
      const placed = { text: item.text, framed: item.framed, x, y, width: item.metrics.w + padding * 2, height: itemHeight, baseline: y + padding + item.metrics.baseline }
      x += placed.width + 4
      return placed
    })
    orderRows.push({ top, height, items }); orderBottom = top + height
  }
  const orderHeight = orderBottom - (sideTop + sidesHeight)
  return { title, subtitle, titleTop: margin, subtitleTop: margin + titleHeight + (titleHeight ? 5 : 0), signaturesTop, creditsTop, sidesBottom: sideTop + sidesHeight,
    orderRows, height: centerHeight + (centerHeight ? 5 : 0) + sidesHeight + systemGap + orderHeight }
}

import { scoreCreditLines, type ScoreDocument } from '@m3n/notation'
import type { TextMeasurer } from './native-measure.js'

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
  const orderHeight = document.order?.length ? Math.ceil((100 + document.order.reduce((sum, name) => sum + measurer.measureText(name, { fontSize: 16 }).w + 43, 0)) / available) * 34 : 0
  return { title, subtitle, titleTop: margin, subtitleTop: margin + titleHeight + (titleHeight ? 5 : 0), signaturesTop, creditsTop, sidesBottom: sideTop + sidesHeight,
    height: centerHeight + (centerHeight ? 5 : 0) + sidesHeight + systemGap + orderHeight }
}

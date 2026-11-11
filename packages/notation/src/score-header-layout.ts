import type { ScoreHeaderMetadata } from './notation/mei-document.js'

export type ScoreHeaderTextLayout = {
  value: string
  x: number
  y: number
  anchor?: 'middle' | 'end'
  fill: string
  font: string
  size: number
  bold: boolean
}

export type ScoreHeaderLayout = {
  lines: ScoreHeaderTextLayout[]
  height: number
}

function number(value: number) {
  return Number(value.toFixed(2))
}

export type ScoreHeaderTextMeasurer = (text: string, size: number, font: string) => number

const estimateTextWidth: ScoreHeaderTextMeasurer = (text, size) =>
  [...text].reduce((width, char) => width + (char.codePointAt(0)! > 0x7f ? 1 : 0.58) * size, 0)

/** Shared text geometry for the staff and numbered-notation score headers. */
export function scoreHeaderLayout(metadata: readonly ScoreHeaderMetadata[], width: number, measureText: ScoreHeaderTextMeasurer = estimateTextWidth): ScoreHeaderLayout {
  if (metadata.length === 0) return { lines: [], height: 0 }

  const centered = metadata.filter((item) => item.side === 'center').sort((left, right) => left.priority - right.priority)
  const left = metadata.filter((item) => item.side === 'left').sort((left, right) => left.priority - right.priority)
  const right = metadata.filter((item) => item.side === 'right').sort((left, right) => left.priority - right.priority)
  const credits = right.map(item => /^(作词：|作曲：|编曲：|演唱：)([\s\S]*)$/.exec(item.value))
  const font = 'system-ui, sans-serif'
  const labelWidth = Math.max(0, ...credits.map(credit => credit ? measureText(credit[1]!, 14, font) : 0))
  const nameWidth = Math.max(0, ...credits.map(credit => credit ? measureText(credit[2]!, 14, font) : 0))
  const labelX = number(width - 28 - nameWidth - 16 - labelWidth)
  const lines: ScoreHeaderTextLayout[] = []
  let y = 28

  for (const item of centered) {
    const title = item.priority === 0
    const size = title ? 32 : 16
    if (!title) y += 8
    lines.push({
      value: item.value,
      x: number(width / 2),
      y: number(y + size),
      anchor: 'middle',
      fill: title ? '#20242b' : '#59616d',
      font: 'ui-serif, serif',
      size,
      bold: title,
    })
    y += title ? 43.2 : 23.76
  }

  const detailCount = Math.max(left.length, right.length)
  if (detailCount > 0) {
    y += 12
    for (let index = 0; index < detailCount; index += 1) {
      const baseline = number(y + 14)
      const leftValue = left[index]?.value
      const rightValue = right[index]?.value
      if (leftValue) lines.push({ value: leftValue, x: 28, y: baseline, fill: '#30363e', font: 'system-ui, sans-serif', size: 14, bold: false })
      const credit = credits[index]
      if (credit) {
        lines.push({ value: credit[1]!, x: labelX, y: baseline, fill: '#30363e', font, size: 14, bold: false })
        lines.push({ value: credit[2]!, x: number(width - 28), y: baseline, anchor: 'end', fill: '#30363e', font, size: 14, bold: false })
      } else if (rightValue) lines.push({ value: rightValue, x: number(width - 28), y: baseline, anchor: 'end', fill: '#30363e', font, size: 14, bold: false })
      y += 20.8 + (index < detailCount - 1 ? 6 : 0)
    }
  }

  return { lines, height: number(y + 8) }
}

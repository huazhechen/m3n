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

/** Shared text geometry for the staff and numbered-notation score headers. */
export function scoreHeaderLayout(metadata: readonly ScoreHeaderMetadata[], width: number): ScoreHeaderLayout {
  if (metadata.length === 0) return { lines: [], height: 0 }

  const centered = metadata.filter((item) => item.side === 'center').sort((left, right) => left.priority - right.priority)
  const left = metadata.filter((item) => item.side === 'left').sort((left, right) => left.priority - right.priority)
  const right = metadata.filter((item) => item.side === 'right').sort((left, right) => left.priority - right.priority)
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
      if (rightValue) lines.push({ value: rightValue, x: number(width - 28), y: baseline, anchor: 'end', fill: '#30363e', font: 'system-ui, sans-serif', size: 14, bold: false })
      y += 20.8 + (index < detailCount - 1 ? 6 : 0)
    }
  }

  return { lines, height: number(y + 8) }
}

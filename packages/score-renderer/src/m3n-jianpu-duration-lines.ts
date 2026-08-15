import { durationLineCount, type PositionedEvent } from './m3n-jianpu-layout.js'

/** Direct ScoreDocument counterpart to JianpuABC duration-line grouping. */
export function renderDurationLines(positioned: readonly PositionedEvent[], beat: number, fontSize: number, rightBarlineX?: number) {
  const output: string[] = []
  const max = positioned.reduce((value, item) => Math.max(value, durationLineCount(item.event, beat)), 0)
  for (let level = 1; level <= max; level += 1) {
    let index = 0
    while (index < positioned.length) {
      const first = positioned[index]
      if (!first || durationLineCount(first.event, beat) < level) { index += 1; continue }
      const group = [first]
      while (index + group.length < positioned.length) {
        const next = positioned[index + group.length]
        if (!next || durationLineCount(next.event, beat) < level || Math.floor(next.startBeat / beat) !== Math.floor(first.startBeat / beat)) break
        group.push(next)
      }
      const last = group.at(-1)!
      const x1 = first.centerX - fontSize * 0.34
      const rawX2 = last.centerX + fontSize * 0.34
      const x2 = Math.max(x1 + fontSize * 0.18, Math.min(rawX2, rightBarlineX === undefined ? rawX2 : rightBarlineX - fontSize * 0.32))
      const y = fontSize * 0.43 + (level - 1) * 4.5
      output.push(`<line class="duration-line" data-line-level="${level}" data-group-size="${group.length}" x1="${round(x1)}" y1="${round(y)}" x2="${round(x2)}" y2="${round(y)}"/>`)
      index += group.length
    }
  }
  return output.join('')
}

function round(value: number) { return Math.round(value * 100) / 100 }

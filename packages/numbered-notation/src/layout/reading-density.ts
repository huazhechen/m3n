/** Reading diagnostics use each notation's own preferred advances, not ink
 * coverage. Windows never cross a measure or voice boundary. */
export type ReadingPoint = { beat: number; x: number; preferredNext: number }
export function scoreReadingWindows(points: readonly ReadingPoint[]) {
  const windows: { start: number; end: number; beats: number; events: number; actual: number; preferred: number; ratio: number }[] = []
  for (let start = 0; start + 1 < points.length; start++) {
    let preferred = 0
    for (let end = start + 1; end < points.length; end++) {
      const duration = points[end]!.beat - points[start]!.beat
      if (duration > 2 + 1e-7) break
      preferred += points[end - 1]!.preferredNext
      const actual = points[end]!.x - points[start]!.x
      windows.push({ start, end, beats: duration <= 1 + 1e-7 ? 1 : 2, events: end - start + 1,
        actual, preferred, ratio: preferred / Math.max(actual, 1e-6) })
    }
  }
  return { windows, worstRatio: Math.max(1, ...windows.map(window => window.ratio)),
    penalty: windows.reduce((sum, window) => sum + Math.max(0, window.ratio - 1) ** 2, 0) / Math.max(1, windows.length) }
}

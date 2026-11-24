/** Exact painted-box overlap test with an x-axis sweep as the broad phase.
 * Return DOM-order pairs so diagnostics match exhaustive pairwise inspection. */
export function inkOverlapPairs(boxes, tolerance = .5, stats = {}) {
  const ordered = boxes.map((box, index) => ({ ...box, index }))
    .filter(box => box.width > tolerance && box.height > tolerance)
    .sort((a, b) => a.x - b.x || a.index - b.index)
  const pairs = []
  let testedPairs = 0
  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i]
    for (let j = i + 1; j < ordered.length; j++) {
      const b = ordered[j]
      if (a.x + a.width - b.x <= tolerance) break
      testedPairs++
      if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > tolerance &&
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > tolerance) {
        pairs.push(a.index < b.index ? [a.index, b.index] : [b.index, a.index])
      }
    }
  }
  stats.testedPairs = (stats.testedPairs ?? 0) + testedPairs
  return pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

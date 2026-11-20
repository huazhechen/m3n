/** Use conventional beat units for engraving; playback tempo remains quarter-based. */
export function displayedTempo(qpm: number, count: number, unit: number) {
  if (count >= 6 && count % 3 === 0 && unit >= 8) {
    const dottedUnit = unit / 2
    const bpm = Math.round(qpm * unit / 12 * 100) / 100
    return { unit: dottedUnit, dots: 1, bpm }
  }
  const bpm = Math.round(qpm * unit / 4 * 100) / 100
  return { unit, dots: 0, bpm }
}

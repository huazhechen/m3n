/** Engrave the meter denominator note; playback always remains in QPM. */
export function displayedTempo(qpm: number, _count: number, unit: number) {
  const bpm = Math.round(qpm * unit / 4 * 100) / 100
  return { unit, dots: 0, bpm }
}

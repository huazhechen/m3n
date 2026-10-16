/** QPM is the playback unit; grouping only changes the engraved metronome mark. */
export function displayedTempo(qpm: number, count: number, unit: number) {
  const compound = count > 3 && count % 3 === 0 && unit >= 8
  const noteUnit = compound ? unit / 2 : unit
  const dots = compound ? 1 : 0
  const beats = (4 / noteUnit) * (dots ? 1.5 : 1)
  const bpm = Math.round(qpm / beats * 100) / 100
  return { unit: noteUnit, dots, bpm }
}

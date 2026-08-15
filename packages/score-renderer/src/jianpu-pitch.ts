const SCALE = [0, 2, 4, 5, 7, 9, 11]

export function mapMidiToJianpu(pitch: number, tonic: number) {
  const relative = pitch - 60 - ((tonic + 12) % 12)
  const octave = Math.floor(relative / 12)
  const pc = ((relative % 12) + 12) % 12
  let degree = 0
  let accidental = 0
  let distance = 99
  for (let index = 0; index < SCALE.length; index += 1) {
    const d = Math.abs(SCALE[index]! - pc)
    if (d < distance) { distance = d; degree = index }
  }
  const scalePitch = SCALE[degree]!
  if (pc !== scalePitch) accidental = pc > scalePitch ? 1 : -1
  return { jianpuNumber: degree + 1, octaveDot: octave, accidental }
}

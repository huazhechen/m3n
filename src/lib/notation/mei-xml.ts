export function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

export function meiDurationAttributes(beats: number) {
  const candidates = [1, 2, 4, 8, 16, 32, 64].flatMap((dur) =>
    [0, 1, 2, 3].map((dots) => ({ dur, dots, beats: 4 / dur * (2 - 1 / 2 ** dots) })))
  const closest = candidates.reduce((best, item) =>
    Math.abs(item.beats - beats) < Math.abs(best.beats - beats) ? item : best)
  return `dur="${closest.dur}"${closest.dots ? ` dots="${closest.dots}"` : ''}`
}

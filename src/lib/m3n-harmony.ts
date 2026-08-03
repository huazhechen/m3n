import { m3nPitch } from './m3n-direct'

export type M3NChord = { symbol: string; midi: number[] }

export function m3nChord(value: string, key: string): M3NChord | null {
  const match = /^(VII|III|II|IV|VI|V|I|vii|iii|ii|iv|vi|v|i)(m|dim|aug|sus2|sus4|maj7|maj9|[2-9]|1[0-3])?$/.exec(value)
  if (!match) return null
  const degrees: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 }
  const roman = match[1] ?? 'I'
  const root = m3nPitch(String(degrees[roman.toUpperCase()] ?? 1), key)
  const accidental = root.accidGes ? ({ s: '#', f: 'b', ss: '##', x: '##', ff: 'bb', n: '' } as Record<string, string>)[root.accidGes] ?? '' : ''
  const suffix = match[2] ?? ''
  const minor = roman === roman.toLowerCase() || suffix === 'm'
  const quality = suffix === 'dim' || suffix === 'aug' || suffix === 'sus2' || suffix === 'sus4' || suffix === 'maj7' || suffix === 'maj9'
    ? suffix : suffix && suffix !== 'm' ? `${minor ? 'm' : ''}${suffix}` : minor ? 'm' : ''
  const chromatic = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[root.pname] ?? 0
  const alteration = { s: 1, f: -1, ss: 2, x: 2, ff: -2, n: 0 }[root.accidGes ?? ''] ?? 0
  const third = quality === 'dim' ? 3 : quality === 'sus2' ? 2 : quality === 'sus4' ? 5 : minor ? 3 : 4
  const fifth = quality === 'dim' ? 6 : quality === 'aug' ? 8 : 7
  const intervals = /^maj(?:7|9)$/.test(quality) ? [0, third, fifth, 11]
    : /^(?:m)?(7|9|11|12|13)$/.test(quality) ? [0, third, fifth, 10] : [0, third, fifth]
  const rootMidi = (root.oct + 1) * 12 + chromatic + alteration - 12
  return { symbol: `${root.pname.toUpperCase()}${accidental}${quality}`, midi: intervals.map((interval) => rootMidi + interval) }
}

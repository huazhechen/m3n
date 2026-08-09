import { m3nPitch } from './m3n-direct.js' 

export type M3NChord = { symbol: string }

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
  return { symbol: `${root.pname.toUpperCase()}${accidental}${quality}` }
}

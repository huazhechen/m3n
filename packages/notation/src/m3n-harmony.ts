import { m3nPitch } from './m3n-direct.js' 
import { parseHarmonySymbol } from './notation/harmony-syntax.js'

export type M3NChord = { symbol: string }

export function m3nChord(value: string, key: string): M3NChord | null {
  const parsed = parseHarmonySymbol(value)
  if (!parsed) return null
  if (!parsed.roman) return { symbol: value }
  const degrees: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 }
  const roman = parsed.root
  const root = m3nPitch(String(degrees[roman.toUpperCase()] ?? 1), key)
  const accidental = root.accidGes ? ({ s: '#', f: 'b', ss: '##', x: '##', ff: 'bb', n: '' } as Record<string, string>)[root.accidGes] ?? '' : ''
  const suffix = parsed.quality
  const minor = roman === roman.toLowerCase() || suffix === 'm'
  const quality = suffix === 'dim' || suffix === 'aug' || suffix === 'sus2' || suffix === 'sus4' || suffix === 'maj7' || suffix === 'maj9'
    ? suffix : suffix && suffix !== 'm' ? `${minor ? 'm' : ''}${suffix}` : minor ? 'm' : ''
  return { symbol: `${root.pname.toUpperCase()}${accidental}${quality}${parsed.bass ? `/${parsed.bass}` : ''}` }
}

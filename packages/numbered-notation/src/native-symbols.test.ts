import { describe, expect, it } from 'vitest'
import { attrs, xml } from './native-symbols.js'
import { nativeSvgNumber } from './native-svg-number.js'

const originalXml = (value: string | number) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const originalAttrs = (values: Record<string, string | number | undefined>) => Object.entries(values).filter(([, value]) => value !== undefined)
  .map(([name, value]) => ` ${name}="${originalXml(typeof value === 'number' ? Number(value.toFixed(6)) : value!)}"`).join('')

describe('SVG serialization without redundant escaping and numeric formatting', () => {
  it('keeps entity escaping, coordinate rounding, omission and attribute order byte identical', () => {
    expect(attrs({ x: -0, y: 12.34567891, missing: undefined, title: '<&>"\'中文 &amp;', empty: '' }))
      .toBe(' x="0" y="12.345679" title="&lt;&amp;&gt;&quot;&apos;中文 &amp;amp;" empty=""')
    const inherited = Object.assign(Object.create({ inherited: 'skip' }), { own: 'yes' })
    expect(attrs(inherited)).toBe(' own="yes"')
  })

  it('matches the original serializer over randomized Unicode, entities and fractional coordinates', () => {
    let seed = 192837
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
    const alphabet = ['&', '<', '>', '"', "'", '春', '𝄞', 'a', ' ', '\n', ';', '=']
    for (let trial = 0; trial < 1000; trial++) {
      const text = Array.from({ length: 20 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('')
      const values = { text, x: (random() - .5) * 10000, zero: 0, size: 22, missing: undefined }
      expect(xml(text)).toBe(originalXml(text))
      expect(attrs(values)).toBe(originalAttrs(values))
    }
  })

  it('preserves numeric values, negative zero normalization and the exact six-decimal tie behavior', () => {
    for (const value of [0, -0, 1, -22, 1e21, Number.MAX_SAFE_INTEGER, NaN, Infinity, -Infinity, 0.0000005, -0.0000005, 0.1234565, -12.34567891])
      expect(nativeSvgNumber(value)).toBe(Number(value.toFixed(6)))
  })
})

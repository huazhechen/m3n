import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from './m3n-direct'

describe('direct M3N parser', () => {
  it('does not leak part-local settings into the next named part', () => {
    const document = parseM3NDocument([
      '{key=C} {2/4} {120qpm} {parts=A B}',
      '{part=A}{key=D} {3/4} {90qpm}1 2 3 |{/}',
      '{part=B}1 2 |{/}',
    ].join('\n'))
    const first = document.parts.get('A')?.melody[0]?.events[0]
    const second = document.parts.get('B')?.melody[0]?.events[0]

    expect(first).toMatchObject({ key: 'D', meterCount: 3, meterUnit: 4, tempo: 90 })
    expect(second).toMatchObject({ key: 'C', meterCount: 2, meterUnit: 4, tempo: 120 })
  })

  it('inherits melody setting changes in the bass staff', () => {
    const document = parseM3NDocument([
      '{key=C} {2/4} {120qpm} 1 2 | {key=D} {3/4} {90qpm}1 2 3 |||',
      '{bass}1d 2d | 1d 2d 3d |||{/}',
    ].join('\n'))
    const bass = document.parts.get('score')?.bass
    const first = bass?.[0]?.events[0]
    const second = bass?.[1]?.events[0]

    expect(first).toMatchObject({ key: 'C', meterCount: 2, meterUnit: 4, tempo: 120 })
    expect(second).toMatchObject({ key: 'D', meterCount: 3, meterUnit: 4, tempo: 90 })
  })
})

// @vitest-environment jsdom
import { parseM3NDocument,scoreEventIds } from '@m3n/notation'
import { expect,it } from 'vitest'
import { NumberedNotationScore } from './index.js'
import { layoutNativeScore } from './native-layout.js'

it.each([
  ['long notes', '{4/4}\nN: 6^~ 6^ |||', 3],
  ['a long note after a fractional pickup, retaining its incoming tie', '{4/4}\nN: (5 6~) 6^ 7 |||', 1],
  ['chords', '{4/4}\nN: [135:h]^~ [135:h]^ |||', 3],
  ['bass', '{2/4}\nN: 1 2 |||\nB: 6d~ 6d |||', 1],
  ['an inherited accidental', '{2/4}\nN: 4#~ 4 |||', 1],
  ['an explicit accidental matching inherited pitch', '{4/4}\nN: 4# 4~ 4# 0 |||', 1],
  ['a natural overriding the key signature', '{key=G}{2/4}\nN: 7=~ 7 |||', 1],
] as const)('uses dashes for %s and preserves every event identity', (_name, source, count) => {
  const document = parseM3NDocument(source)
  const pages = NumberedNotationScore.create(document).render({ width: 800, paged: false })
  const root = new DOMParser().parseFromString(pages.join(''), 'text/html')
  expect(root.querySelectorAll('g.note[data-m3n-role="sustain"]')).toHaveLength(count)
  for (const id of scoreEventIds(document).values()) expect(root.querySelector(`[data-m3n-id="${id}"]`)).not.toBeNull()
})
it.each([
  ['1^', 0], ['[135:h]^', 0], ['[234:2]', 2], ['[230:2]', 1],
] as const)('ends legato on the last pitched glyph: %s', (music, slot) => {
  const layout = layoutNativeScore(parseM3NDocument(`{4/4}\nN: {lg}2 ${music}{/} 0 |||`), { width: 800, paged: false })
  const slur = layout.relations.find(r => r.kind === 'slur')!
  expect(slur).toBeDefined()
  expect(slur.last.sustain).toBe(false)
  expect(slur.last.slot).toBe(slot)
  expect(slur.last.pitches.some(p => p.degree !== '0')).toBe(true)
})
it('keeps following lyrics aligned in every verse after a tied-note slot', () => {
  const document = parseM3NDocument('{4/4}\nN: 1~ 1 2 3 |||\nL1: 春天 地\nL2: 花开 了')
  const pages = NumberedNotationScore.create(document).render({ width: 800, paged: false })
  const root = new DOMParser().parseFromString(pages.join(''), 'text/html')
  expect(root.querySelector('g.note[data-m3n-id="m3n-e-2"]')?.getAttribute('data-m3n-role')).toBe('sustain')
  expect(root.querySelectorAll('[data-m3n-role="lyric"][data-m3n-id="m3n-e-2"]')).toHaveLength(0)
  expect([...root.querySelectorAll('[data-m3n-role="lyric"]')].map(n => n.textContent)).toEqual(['春', '花', '天', '开', '地', '了'])
})

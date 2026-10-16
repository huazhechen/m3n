// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { ASTFunctionNode, compileScore } from '@m3n/jpfun'
import { parseM3NDocument, scoreEventIds } from '@m3n/notation'
import { projectNumberedScore } from './projection.js'
import { NumberedNotationScore } from './score.js'

function inspect(source: string, width = 800, paged = false) {
  const document = parseM3NDocument(source)
  const before = structuredClone(document)
  const projection = projectNumberedScore(document, { width, paged })
  const result = compileScore(projection.source, { autoWrap: true, alignRelations: true })
  const pages = NumberedNotationScore.create(document).render({ width, paged })
  const root = new DOMParser().parseFromString(pages.join(''), 'text/html')
  expect(document).toEqual(before)
  return { document, projection, result, root }
}

describe('numbered full-beat sustain continuations', () => {
  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('uses dashes for a tied chain with original event IDs and timing at $width, paged=$paged', ({ width, paged }) => {
    const { document, projection, result, root } = inspect('{4/4}\nN: 6~ 6~ 6~ 6 |||\nL: 白', width, paged)
    expect(projection.source).not.toContain('@tie(')
    expect([...root.querySelectorAll('g.note text')].map(node => node.textContent).join('')).toBe('6')
    const events = document.parts.values().next().value!.melody[0]!.events
    const ids = scoreEventIds(document)
    for (const [index, event] of events.entries()) {
      const group = root.getElementById(ids.get(event)!)!
      expect(group).not.toBeNull()
      expect(group.getAttribute('data-m3n-role')).toBe(index ? 'sustain' : null)
      expect(group.querySelectorAll('line')).toHaveLength(index ? 1 : 0)
      const binding = [...projection.bindings.values()].find(binding => binding.event === event)!
      const node = result.layout.objects.find(node => node.ast instanceof ASTFunctionNode && node.ast.labelable?.()?.label === binding.label)!
      expect(node.t.toNumber()).toBe(index)
      expect(node.T.toNumber()).toBe(1)
    }
    expect(root.querySelector('text[data-m3n-role="lyric"]')?.textContent).toBe('白')
  })

  it.each([
    ['long notes', '{4/4}\nN: 6^~ 6^ |||', 3],
    ['a pickup into a full beat', '{4/4}\nN: (5 6~) 6^ 7 |||', 2],
    ['chords', '{4/4}\nN: [135:h]^~ [135:h]^ |||', 3],
    ['bass', '{2/4}\nN: 1 2 |||\nB: 6d~ 6d |||', 1],
    ['an inherited accidental', '{2/4}\nN: 4#~ 4 |||', 1],
    ['an explicit accidental matching inherited pitch', '{4/4}\nN: 4# 4~ 4# 0 |||', 1],
    ['a natural overriding the key signature', '{key=G}{2/4}\nN: 7=~ 7 |||', 1],
  ])('uses native dashes for %s', (_name, source, count) => {
    const { projection, root } = inspect(source)
    expect(projection.source).not.toContain('@tie(')
    expect(root.querySelectorAll('g.note[data-m3n-role="sustain"]')).toHaveLength(count)
  })

  it('retains the pitched chain head when a dash continues across a bar', () => {
    const { projection, result } = inspect('{2/4}\nN: 6~ 6~ | {br}6^ |||')
    const bindings = [...projection.bindings.values()]
    expect(projection.source.match(/@tie\(/g)).toHaveLength(1)
    expect(projection.source).toContain(`@tie(${bindings[0]!.label},${bindings[2]!.label})`)
    const points = (result.lowering.attachments.find(attachment => 'endPoints' in attachment) as unknown as { endPoints: { ast: ASTFunctionNode }[] }).endPoints
    expect(points.map(point => point.ast.callName)).toEqual(['note', 'note'])
  })

  it('keeps following lyrics aligned in every verse after removing a tied-note slot', () => {
    const { root } = inspect('{4/4}\nN: 1~ 1 2 3 |||\nL1: 春天地\nL2: 花开了')
    for (const [id, expected] of [['m3n-e-1', '春花'], ['m3n-e-2', ''], ['m3n-e-3', '天开'], ['m3n-e-4', '地了']]) {
      expect([...root.querySelectorAll(`text[data-m3n-role="lyric"][data-m3n-id="${id}"]`)].map(node => node.textContent).join('')).toBe(expected)
    }
  })

  it.each([
    ['separate attacks', '{2/4}\nN: 6 6 |||'],
    ['cross-bar ties', '{1/4}\nN: 6~ | 6 |||'],
    ['fractional continuations', '{2/4}\nN: 6~ (6 7) |||'],
    ['syncopated continuations', '{2/4}\nN: (6~) 6 (7) |||'],
    ['forced lyric syllables', '{2/4}\nN: 6~ 6 |||\nL: 白+啊'],
    ['independent articulations', '{2/4}\nN: 6~ 6{fermata} |||'],
    ['a new tempo', '{2/4}\nN: 6~ {80qpm}6 |||'],
    ['a new dynamic', '{2/4}\nN: 6~ {f}6 |||'],
    ['a text annotation', '{2/4}\nN: 6~ {text=保持}6 |||'],
    ['a slur endpoint', '{3/4}\nN: 6~ {lg}6 7{/} |||'],
    ['a tuplet', '{4/4}\nN: [166~:2] 6^ |||'],
    ['different pitches', '{2/4}\nN: 6~ 5 |||'],
    ['different octaves', '{2/4}\nN: 6~ 6e |||'],
    ['different accidentals', '{2/4}\nN: 4#~ 4= |||'],
  ])('preserves the notation for %s', (name, source) => {
    const { projection, root } = inspect(source)
    expect(root.querySelectorAll('g.note[data-m3n-role="sustain"]')).toHaveLength(name === 'a tuplet' ? 1 : 0)
    if (name !== 'separate attacks') expect(projection.source).toContain('@tie(')
    if (name === 'forced lyric syllables') expect([...root.querySelectorAll('text[data-m3n-role="lyric"]')].map(node => node.textContent).join('')).toBe('白啊')
    if (name === 'independent articulations') expect(root.querySelector('#m3n-e-2 path')).not.toBeNull()
  })
})

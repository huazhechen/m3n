// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { compileScorePerformance, parseM3NDocument } from '@m3n/notation'
import { NumberedNotationScore } from '@m3n/numbered-notation'
import { NativePlaybackScore } from '@m3n/score-renderer/playback'
import { queryPlaybackElements } from './score-playback-elements'
import reasons from '../scores/yi_qian_ge_shang_xin_de_li_you_01.m3n?raw'

describe('tuplet playback notes and lyrics', () => {
  it('selects only the sounding subdivision and current verse through repeats and rests', async () => {
    const score = parseM3NDocument('{2/4}{120qpm}\nN: ||: ([1 0 3:2]) 4 :|||\nL1: 春夏秋\nL2: 天地人')
    const paper = document.createElement('div')
    paper.innerHTML = NumberedNotationScore.create(score).render({ width: 600, paged: false }).join('')
    const playback = await NativePlaybackScore.create(score)
    for (const [time, slot, verse, lyric] of [
      [0, 0, 1, '春'], [167, 1, 1, ''], [334, 2, 1, '夏'],
      [1000, 0, 2, '天'], [1167, 1, 2, ''], [1334, 2, 2, '地'],
    ] as const) {
      const active = playback.elementsAtTime(time)[0]!
      expect(active).toMatchObject({ tupletSlot: slot, rendition: verse })
      const elements = queryPlaybackElements(paper, active.xmlId, active.rendition, active.tupletSlot)
      const notes = elements.filter(element => element.matches('g.note'))
      expect(notes).toHaveLength(1)
      expect(notes[0]!.getAttribute('data-m3n-tuplet-slot')).toBe(String(slot))
      expect(elements.filter(element => element.matches('text[data-m3n-role="lyric"]')).map(element => element.textContent).join('')).toBe(lyric)
    }
    const ordinary = playback.elementsAtTime(500)[0]!
    expect(ordinary.tupletSlot).toBeUndefined()
    expect(queryPlaybackElements(paper, ordinary.xmlId, ordinary.rendition).some(element => element.textContent === '秋')).toBe(true)
    playback.destroy()
  })
  it('excludes a staff tuplet parent so its descendants cannot all inherit playback color', () => {
    const paper = document.createElement('div')
    paper.innerHTML = '<svg><g data-m3n-id="m3n-e-1" class="tuplet"><g class="note" data-m3n-id="m3n-e-1" data-m3n-tuplet-slot="0"></g><g class="note" data-m3n-id="m3n-e-1" data-m3n-tuplet-slot="1"></g></g><g class="verse" data-m3n-id="m3n-e-1" data-m3n-tuplet-slot="1" data-m3n-rendition="1">春</g></svg>'
    const elements = queryPlaybackElements(paper, 'm3n-e-1', 1, 1)
    expect(elements).toHaveLength(2)
    expect(elements.some(element => element.matches('.tuplet'))).toBe(false)
    expect(elements.some(element => element.textContent === '春')).toBe(true)
  })
})


it('highlights the repeated verse and chorus lyrics after the second Reasons repeat sign', () => {
  const score = parseM3NDocument(reasons)
  const paper = document.createElement('div')
  paper.innerHTML = NumberedNotationScore.create(score).render({ width: 600, paged: false }).join('')
  const elements = compileScorePerformance(score).elements.filter(element => element.voice === 'score:melody')
  const highlighted = (element: typeof elements[number]) => queryPlaybackElements(paper, element.xmlId, element.rendition, element.tupletSlot)
    .filter(node => node.matches('text[data-m3n-role="lyric"]')).map(node => node.textContent).join('')
  const first = elements.filter(element => element.start < 92)
  const repeated = elements.filter(element => element.start >= 112 && element.start < 204)
  expect(repeated.map(element => [element.start - 112, highlighted(element)]))
    .toEqual(first.map(element => [element.start, highlighted(element)]))
  for (const [start, lyric] of [[112.75, '爱'], [144.75, '爱'], [176, '伤'], [212, '伤']] as const) {
    expect(highlighted(elements.find(element => element.start === start)!)).toBe(lyric)
  }
})


it('cycles only lyric rows when an unnumbered note contains visible music text', () => {
  const paper = document.createElement('div')
  paper.innerHTML = '<svg><g class="note" data-m3n-id="note"><text>3</text></g><text data-m3n-id="note" data-m3n-role="lyric" data-m3n-rendition="1" data-m3n-passes="1">人</text><text data-m3n-id="note" data-m3n-role="lyric" data-m3n-rendition="2" data-m3n-passes="2">心</text></svg>'
  for (const [pass, lyric] of [[3, '人'], [4, '心']] as const) {
    const selected = queryPlaybackElements(paper, 'note', pass)
    expect(selected.filter(node => node.matches('[data-m3n-role="lyric"]')).map(node => node.textContent)).toEqual([lyric])
    expect(selected.some(node => node.matches('g.note'))).toBe(true)
  }
})

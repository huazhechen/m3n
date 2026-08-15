// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { NumberedScore } from './numbered-score.js'
import { buildNumberedLayout } from './numbered-layout.js'

describe('NumberedScore', () => {
  it('lays out whole measures, preserves event IDs, and anchors lyrics below their notes', () => {
    const document = parseM3NDocument('{key=C} {2/4}\nN: 1^ 2^ | 3 4 |||\nL: 春天 | 来了')
    const firstEvent = document.parts.get('score')?.melody[0]?.events[0]
    if (firstEvent) firstEvent.beats = 0.5
    const score = NumberedScore.create(document, { width: 360, headerMetadata: [], paged: false })
    const paper = globalThis.document.createElement('div')
    score.attach(paper)
    expect(paper.querySelectorAll('svg.numbered-score')).toHaveLength(1)
    expect(paper.querySelectorAll('g.measure')).toHaveLength(2)
    expect(paper.querySelector('#m3n-e-1')).not.toBeNull()
    expect(paper.querySelectorAll('.numbered-lyric')).not.toHaveLength(0)
    expect(paper.querySelectorAll('.numbered-duration')).not.toHaveLength(0)
  })

  it('reserves lyric width before system wrapping instead of allowing text to overlap', () => {
    const document = parseM3NDocument('{key=C} {2/4}\nN: 1 2 | 3 4 |||\nL: 长长 | 歌词')
    const measures = (document.parts.get('score')?.melody ?? []).filter((measure) => measure.events.length > 0 || measure.multiRest !== undefined)
    const layout = buildNumberedLayout(measures, {
      width: 320,
      padding: 28,
      fontSize: 30,
      beatLength: 1,
      lyricWidth: () => 120,
    })
    expect(layout).toHaveLength(2)
    expect(layout[0]?.measures).toHaveLength(1)
    expect(layout[1]?.measures).toHaveLength(1)
  })
})

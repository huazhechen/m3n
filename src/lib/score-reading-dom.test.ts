// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { describeAccessibleScore } from './score-accessibility'
import { attachScoreReading, currentReadingMeasure, focusScoreMeasure, preserveScoreReading, resumeScoreReading } from './score-reading-dom'

describe('reading text attached to music geometry', () => {
  it('restores the focused note after reflow and preserves outside control focus', () => {
    const paper = document.createElement('div')
    const control = document.createElement('button')
    document.body.append(paper, control)
    const score = parseM3NDocument('{2/4}\nN: 1 2 |||')
    const paint = (expanded = false) => {
      paper.innerHTML = `<svg><g data-reading-measure="${expanded ? 'bar-2' : 'bar-1'}" tabindex="-1"><g data-reading-event="${expanded ? 'event-1-rend2' : 'event-1'}" data-reading-source="event-1" tabindex="-1" /></g></svg>`
    }
    preserveScoreReading(paper, score)()
    paint()
    const first = paper.querySelector<SVGGElement>('[data-reading-event]')!
    first.focus()
    const restore = preserveScoreReading(paper, score)
    paint(true)
    restore()
    expect(document.activeElement).toBe(paper.querySelector('[data-reading-event]'))
    expect(currentReadingMeasure(paper)).toBe('bar-2')
    control.focus()
    const restoreWithControlFocused = preserveScoreReading(paper, score)
    paint()
    restoreWithControlFocused()
    expect(document.activeElement).toBe(control)
    const note = paper.querySelector<SVGGElement>('[data-reading-event]')!
    note.scrollIntoView = vi.fn()
    resumeScoreReading(paper, 'unused')
    expect(document.activeElement).toBe(note)
    expect(note.scrollIntoView).toHaveBeenCalled()
    paper.remove(); control.remove()
  })
  it('uses renderer ink bounds instead of font line boxes for hit areas', () => {
    const paper = document.createElement('div')
    paper.innerHTML = '<svg><g class="measure" id="m3n-measure-1-1" data-m3n-ink-bounds="10 20 100 40" /></svg>'
    const group = paper.querySelector<SVGGElement>('g')!
    group.getBBox = vi.fn(() => ({ x: 0, y: -200, width: 100, height: 600 }) as DOMRect)
    const text = describeAccessibleScore(parseM3NDocument('{2/4}\nN: 1 2 |||'))
    attachScoreReading(paper, text)
    attachScoreReading(paper, text)
    expect(group.getBBox).not.toHaveBeenCalled()
    const areas = group.querySelectorAll('[data-score-reading-hitarea]')
    expect(areas).toHaveLength(1)
    expect(['x', 'y', 'width', 'height'].map(key => areas[0]!.getAttribute(key))).toEqual(['10', '20', '100', '40'])
  })

  it('names actual measures and events and hides decorative glyphs without painting new text', () => {
    const paper = document.createElement('div')
    paper.innerHTML = '<svg role="img"><text>曲名</text><g class="system"><g class="measure" id="m3n-measure-1-1"><g class="note" id="m3n-e-1"><text>1</text></g><g class="note" id="m3n-e-1-sustain2"><text>—</text></g><text>歌词</text><g class="note" id="m3n-e-2"><text>2</text></g></g></g></svg>'
    const before = paper.querySelector('svg')!.querySelectorAll('text').length
    const text = describeAccessibleScore(parseM3NDocument('{4/4}\nN: 1^ 2^ |||'))
    attachScoreReading(paper, text)
    const measure = paper.querySelector('[data-reading-measure]')!
    expect(measure.getAttribute('role')).toBe('group')
    expect(measure.getAttribute('aria-label')).toBe('第1小节，全曲结束')
    expect(paper.querySelector('[tabindex]')).toBeNull()
    expect(paper.querySelector('#m3n-e-1')!.getAttribute('aria-label')).toContain('哆，音级1')
    expect(paper.querySelector('#m3n-e-1 text')!.getAttribute('aria-hidden')).toBe('true')
    expect(paper.querySelector('#m3n-e-1-sustain2')!.getAttribute('aria-hidden')).toBe('true')
    expect(paper.querySelectorAll('[role="img"]')).toHaveLength(2)
    expect(paper.querySelectorAll('text')).toHaveLength(before)
    expect([...paper.querySelectorAll('title')].map(title => title.textContent).join(' ')).toContain('第3拍')
    expect(paper.querySelector('svg')!.getAttribute('aria-hidden')).toBeNull()
    expect(paper.querySelector('.system')!.getAttribute('aria-hidden')).toBeNull()
    expect(paper.querySelector('svg > text')!.getAttribute('aria-hidden')).toBe('true')
    const titles = paper.querySelectorAll('title').length
    attachScoreReading(paper, text)
    expect(paper.querySelectorAll('title')).toHaveLength(titles)
  })

  it.each(['m3n-measure-1-1-s2', 'm3n-measure-1-1-fragment-2'])('keeps continuation %s addressable and reads tuplets once per fragment', id => {
    const paper = document.createElement('div')
    paper.innerHTML = `<svg><g class="measure" id="${id}"><g class="note" id="m3n-e-1-n2"><text>2</text></g><g class="note" id="m3n-e-1-n3"><text>3</text></g></g></svg>`
    attachScoreReading(paper, describeAccessibleScore(parseM3NDocument('{2/4}\nN: [1 2 3:2] |||')))
    expect(paper.querySelectorAll('[role="img"]')).toHaveLength(1)
    expect(paper.querySelector('[role="img"]')!.getAttribute('aria-label')).toContain('3连音')
    const measure = paper.querySelector<SVGGElement>('[data-reading-measure]')!
    measure.scrollIntoView = vi.fn()
    measure.focus = vi.fn()
    focusScoreMeasure(paper, 'm3n-measure-1-1')
    expect(measure.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('describes multi-measure rests on their actual group', () => {
    const paper = document.createElement('div')
    paper.innerHTML = '<svg><g class="measure" id="m3n-measure-1-1"><text>3</text></g></svg>'
    attachScoreReading(paper, describeAccessibleScore(parseM3NDocument('{2/4}\nN: {rest=3} |||')))
    expect(paper.querySelector('.measure')!.getAttribute('aria-label')).toContain('连续休止3小节')
  })
})

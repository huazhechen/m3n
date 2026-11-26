// @vitest-environment jsdom
import { deriveScoreInteraction, measurePlaybackPasses, parseM3NDocument, scoreEventIds, type ScoreDocument } from '@m3n/notation'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { NativeRenderOptions as NumberedNotationRenderOptions } from './native-layout.js'
import { layoutNativeScore } from './native-layout.js'
import { NativeNumberedNotationScore } from './native-score.js'
const options = {paged:false,width:800}

function render(source:string|ScoreDocument,settings:Partial<NumberedNotationRenderOptions>={}) {
 const document=typeof source==='string'?parseM3NDocument(source):source
 const score=NativeNumberedNotationScore.create(document)
 const pages=score.render({...options,...settings})
 const root=new DOMParser().parseFromString('<main>'+pages.join('')+'</main>','text/html')
 return {pages,root,score,document}
}
function numbers(root:Document,id:string){return [...root.querySelectorAll('g.note[data-m3n-id="'+id+'"] text[font-family="Barlow Semi Condensed"]')].map(text=>text.textContent).join('')}
function lyrics(root:Document,id:string,row=1){return [...root.querySelectorAll('text[data-m3n-role="lyric"][data-m3n-id="'+id+'"][data-m3n-rendition="'+row+'"]')].map(text=>text.textContent?.replaceAll('\u200B','')).join('')}

describe('native repeat boundaries', () => {
  it.each([false, true])('shares an opening repeat and restores both boundaries at a break (equal measures: %s)', equalMeasures => {
    const joined = render('{4/4}\nN: 1 2 3 4 | ||: 5 6 7 1e :||', { equalMeasures })
    const split = render('{4/4}\nN: 1 2 3 4 | {br} ||: 5 6 7 1e :||', { equalMeasures })
    // No closing line before a shared opening; an explicit wrap needs that line.
    const measures = [...joined.root.querySelectorAll('g.measure')]
    expect(measures[0]!.querySelectorAll('rect')).toHaveLength(0)
    expect(measures[1]!.querySelectorAll('rect')).toHaveLength(4)
    const splitMeasures = [...split.root.querySelectorAll('g.measure')]
    expect(split.root.querySelectorAll('g.system')).toHaveLength(2)
    expect(splitMeasures[0]!.querySelectorAll('rect')).toHaveLength(1)
    expect(splitMeasures[1]!.querySelectorAll('rect')).toHaveLength(4)
  })

  it('combines adjacent end and start repeats without drawing the opening twice', () => {
    const result = render('{4/4}\nN: ||: 1 2 3 4 :|| ||: 5 6 7 1e :||')
    const measures = [...result.root.querySelectorAll('g.measure')]
    expect(measures[0]!.querySelectorAll('[data-m3n-role="bar"] > [data-m3n-role="music-dot"]')).toHaveLength(6)
    expect(measures[1]!.querySelectorAll('[data-m3n-role="bar"] > [data-m3n-role="music-dot"]')).toHaveLength(2)
  })
})

describe('native page measurement', () => {
  it('matches rendered page count without requiring SVG generation', () => {
    const score = NativeNumberedNotationScore.create(parseM3NDocument('{4/4}\nN: 1 2 3 4 | 5 6 7 1e | 2 3 4 5 |||'))
    for (const width of [320, 480, 640, 800]) {
      const options = { width, paged: true, pageMargin: 0 }
      expect(score.pageCount(options)).toBe(score.render(options).length)
    }
  })
})

describe('native engraving acceptance', () => {
  const folder = resolve(process.cwd(), '../../src/scores')
  it.each(readdirSync(folder).filter(file => file.endsWith('.m3n')))('keeps every event, pitch slot and lyric in %s across narrow and paged layouts', file => {
    const document = parseM3NDocument(readFileSync(resolve(folder, file), 'utf8'))
    const before = structuredClone(document), ids = scoreEventIds(document)
    Object.defineProperty(document, 'source', { get() { throw new Error('engraving must not scan source') } })
    let firstIds: string[] | undefined
    for (const width of [320, 800]) for (const paged of [false, true]) {
      const { root, score } = render(document, { width, paged })
      expect(score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
      const notes = [...root.querySelectorAll('g.note')]
      const byEvent = new Map<string, Element[]>()
      for (const note of notes) { const id = note.getAttribute('data-m3n-id')!; byEvent.set(id, [...(byEvent.get(id) ?? []), note]) }
      const visibleIds = notes.map(note => note.getAttribute('id')!)
      expect(new Set(visibleIds).size).toBe(visibleIds.length)
      expect(visibleIds.slice().sort()).toEqual((firstIds ??= visibleIds.slice().sort()))
      for (const [event, id] of ids) {
        const fragments = byEvent.get(id) ?? []
        expect(fragments.length, id).toBeGreaterThan(0)
        if (event.kind === 'tuplet') expect(fragments).toHaveLength(event.pitches.length)
        expect(fragments.every(note => note.closest('g.system g.measure'))).toBe(true)
      }
      for (const svg of root.querySelectorAll('svg')) {
        expect(svg.getAttribute('data-engine')).toBe('m3n')
        expect(Number(svg.getAttribute('height'))).toBeGreaterThan(0)
      }
      const allIds = [...root.querySelectorAll('[id]')].map(node => node.id)
      expect(new Set(allIds).size).toBe(allIds.length)
    }
    expect([...document.parts]).toEqual([...before.parts])
  })

  it('aligns melody and bass by musical time, and connects each visible system', () => {
    const document = parseM3NDocument('{4/4}\nN: '+Array(8).fill('1 2 3 4 |').join(' ')+'\nB: '+Array(8).fill('1d^ 5d^ |').join(' '))
    for (const width of [320, 800]) for (const paged of [false, true]) {
      const layout = layoutNativeScore(document, { width, paged })
      for (const system of layout.systems) for (const measure of system.measures) {
        const glyphs = measure.columns.flatMap(column => column.glyphs)
        for (const bass of glyphs.filter(glyph => glyph.lane === 'bass')) expect(glyphs.find(glyph => glyph.lane === 'melody' && glyph.time === bass.time)?.x).toBe(bass.x)
      }
      const { root } = render(document, { width, paged })
      expect(root.querySelectorAll('[data-m3n-role="voice-connector"]')).toHaveLength(root.querySelectorAll('g.system').length)
      expect(render(document, { width, paged, includeBass: false }).root.querySelectorAll('[data-m3n-role="voice-connector"]')).toHaveLength(0)
    }
  })

  it('projects fractional and tuplet durations directly from the domain', () => {
    const document = parseM3NDocument('{4/4}\nN: (1.) ((2)) [345:2] 6 |||')
    const layout = layoutNativeScore(document, options)
    const glyphs = layout.projection.glyphs
    glyphs.forEach((glyph, index) => expect(glyph.time).toBeCloseTo([0, 0.75, 1, 1 + 2 / 3, 1 + 4 / 3, 3][index]!))
    expect(glyphs.map(glyph => glyph.beats)).toEqual([0.75, 0.25, 2 / 3, 2 / 3, 2 / 3, 1])
    expect(glyphs.map(glyph => glyph.pitches.map(pitch => pitch.degree).join(''))).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('keeps a tuplet bracket across all slots and a slur only across its marked slots', () => {
    const document = parseM3NDocument('{4/4}\nN: ([3 {lg}4 5{/}:2]) 1^. |||')
    const layout = layoutNativeScore(document, options)
    const bracket = layout.relations.find(relation => relation.kind === 'tuplet')!
    const slur = layout.relations.find(relation => relation.kind === 'slur')!
    expect([bracket.first.slot, bracket.last.slot]).toEqual([0, 2])
    expect([slur.first.slot, slur.last.slot]).toEqual([1, 2])
    expect(slur.first.pitches[0]!.degree).toBe('4')
    expect(layout.relations.filter(relation => relation.kind === 'tie')).toHaveLength(0)
  })

  it('keeps the numeral and tie when a fractional note sustains into a whole beat', () => {
    const { root } = render('{4/4}\nN: (6 (4 2~)) 2 1^ |||\nL: 洁白枝花')
    expect(root.querySelectorAll('path[data-m3n-relation="tie"]')).toHaveLength(1)
    expect(root.querySelector('g.note[data-m3n-id="m3n-e-4"]')?.getAttribute('data-m3n-role')).not.toBe('sustain')
    expect(numbers(root, 'm3n-e-4')).toBe('2')
  })

  it('separates nested ties from slurs and ends the slur on the pitched head', () => {
    const document = parseM3NDocument('{4/4}\nN: {lg}2 1~ 1^{hold}{/} |||')
    const layout = layoutNativeScore(document, options)
    const tie = layout.relations.find(relation => relation.kind === 'tie')!, slur = layout.relations.find(relation => relation.kind === 'slur')!
    expect(tie.last.xmlId).toBe('m3n-e-3')
    expect(slur.last).toBe(tie.last)
    expect(slur.level).toBeGreaterThan(tie.level)
  })

  it('uses dashes for unmarked whole-beat tied continuations while keeping event identities', () => {
    const { root } = render('{4/4}\nN: 6~ 6~ 6~ 6 |||\nL: 白')
    expect(root.querySelectorAll('g.note')).toHaveLength(4)
    expect(root.querySelectorAll('g.note[data-m3n-role="sustain"]')).toHaveLength(3)
    expect(numbers(root, 'm3n-e-1')).toBe('6')
    expect(numbers(root, 'm3n-e-2')).toBe('')
    expect(lyrics(root, 'm3n-e-1')).toBe('白')
    expect(root.querySelectorAll('[data-m3n-relation="tie"]')).toHaveLength(0)
  })

  it('renders instrumental parentheses and all interval families across systems', () => {
    const source = '{2/4}\nN: {inst}{8va}{cresc}{lg}1 2 | {br}3 4{/}{/}{/}{/} | {decres}5 6{/} |||'
    const { root } = render(source, { width: 320, paged: true })
    expect(root.body.textContent).not.toContain('8va')
    expect(root.querySelector('#m3n-e-1 [data-m3n-role="music-dot"]')).not.toBeNull()
    expect(root.querySelectorAll('[data-m3n-relation="slur"]').length).toBeGreaterThan(0)
    expect([...root.querySelectorAll('[data-m3n-role="instrument-parenthesis"]')].map(node => node.textContent)).toEqual(['(', ')'])
  })
})
it('accepts complementary pickups at repeats without hiding invalid meter', () => {
    const valid = render('{3/8}\nN: ||: ((3e 2#e)) | ((3e 2#e 3e 7 2=e 1e)) |\n---V1\nN: 6 :||\n---V2\nN: 6 |||')
    expect(valid.score.diagnostics).toEqual([])
    const invalid = render('{3/8}\nN: (1 2 3) | 4 | (5 6 7) |||')
    expect(invalid.score.diagnostics.map(item => item.code)).toContain('W_METER_MISMATCH')
  })

it('reflows Qiu Ying independently of font size while retaining event identities', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/qiu_ying_01.m3n'), 'utf8')
    const settings = { width: 590, pageMargin: 8, coreGap: 18, minimumNoteGap: 15 }
    const normal = render(source, settings)
    const reflowed = render(source, { ...settings, wrapWidthRatio: 0.8 })
    expect(reflowed.root.querySelectorAll('g.system').length).toBeGreaterThan(normal.root.querySelectorAll('g.system').length)
    const notes = (root: Document) => [...root.querySelectorAll('g.note')].map(node => [node.getAttribute('data-m3n-id'), node.textContent])
    expect(notes(reflowed.root)).toEqual(notes(normal.root))
    expect(reflowed.root.querySelector('g.note text')?.getAttribute('font-size')).toEqual(normal.root.querySelector('g.note text')?.getAttribute('font-size'))
    expect(reflowed.score.diagnostics).toEqual([])
    for (const wrapWidthRatio of [0, -1, 1.1, NaN, Infinity]) expect(() => render(source, { wrapWidthRatio })).toThrow('wrapWidthRatio')
  })

it.each([false, true])('selects a complete elastic spacing tier in paged=%s layouts', paged => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/liang_liang_01.m3n'), 'utf8')
    for (const width of [320, 800]) {
      const defaults = render(source, { width, paged })
      const chosen = layoutNativeScore(defaults.document, { width, paged, rowEnvelope: true }).options.minimumNoteGap
      expect([8, 16]).toContain(chosen)
      expect(defaults.pages).toEqual(render(source, { width, paged, minimumNoteGap: chosen }).pages)
      expect(defaults.score.diagnostics).toEqual([])
    }
  })

it('applies the equal-measures source switch and permits an explicit rendering override', () => {
    const source = '{equal-measures=true}\n{4/4}\nN: 1^^ | (1 2 3 4 5 6 7 1e) | 1 2 3 4 |||'
    const document = parseM3NDocument(source)
    const equal = render(document, { width: 1200 })
    const disabled = render(document, { width: 1200, equalMeasures: false })
    expect(equal.pages).not.toEqual(disabled.pages)
    expect(disabled.pages).toEqual(render({ ...document, equalMeasures: false }, { width: 1200 }).pages)
    expect([...equal.root.querySelectorAll('g.note')].map(node => [node.getAttribute('data-m3n-id'), node.textContent]))
      .toEqual([...disabled.root.querySelectorAll('g.note')].map(node => [node.getAttribute('data-m3n-id'), node.textContent]))
    expect(equal.score.diagnostics).toEqual([])
  })

it.each([22, 31])('applies a larger minimum clearance at %spx without changing event identities', minimumNoteGap => {
    const source = '{equal-measures=true}\n{4/4}\nN: ' + Array(10).fill('1^^ |').join(' ')
    const normal = render(source, { width: 600 })
    const spaced = render(source, { width: 600, minimumNoteGap })
    expect(spaced.root.querySelectorAll('g.system').length).toBeGreaterThan(normal.root.querySelectorAll('g.system').length)
    expect([...spaced.root.querySelectorAll('g.note')].map(node => [node.getAttribute('data-m3n-id'), node.textContent]))
      .toEqual([...normal.root.querySelectorAll('g.note')].map(node => [node.getAttribute('data-m3n-id'), node.textContent]))
    expect(spaced.score.diagnostics).toEqual([])
  })

it('packs Liang Liang more closely while preserving every note, lyric, tie and source identity', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/liang_liang_01.m3n'), 'utf8')
    const normal = render(source, { width: 760, minimumNoteGap: 15 })
    const compact = render(source, { width: 760, minimumNoteGap: 9 })
    expect(compact.root.querySelectorAll('g.system').length).toBeLessThan(normal.root.querySelectorAll('g.system').length)
    const content = (root: Document) => [...root.querySelectorAll('g.note,text[data-m3n-role="lyric"]')]
      .map(node => [node.getAttribute('data-m3n-id'), node.getAttribute('data-m3n-rendition'), node.textContent])
    expect(content(compact.root)).toEqual(content(normal.root))
    expect(compact.root.querySelectorAll('g.note text[font-size="24"]').length)
      .toEqual(normal.root.querySelectorAll('g.note text[font-size="24"]').length)
    expect(compact.document).toEqual(normal.document)
    expect(compact.score.diagnostics).toEqual([])
  })

it('supports 0.2em note gaps without changing Liang Liang content or font sizes', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/liang_liang_01.m3n'), 'utf8')
    const normal = render(source, { width: 760 })
    const tight = render(source, { width: 760, minimumNoteGap: 4.4 })
    const content = (root: Document) => [...root.querySelectorAll('g.note,text[data-m3n-role="lyric"]')]
      .map(node => [node.getAttribute('data-m3n-id'), node.getAttribute('data-m3n-rendition'), node.textContent])
    expect(content(tight.root)).toEqual(content(normal.root))
    expect(tight.pages).not.toEqual(normal.pages)
    expect(tight.score.diagnostics).toEqual([])
    expect(tight.root.querySelectorAll('g.note text[font-size="24"]').length)
      .toEqual(normal.root.querySelectorAll('g.note text[font-size="24"]').length)
    for (const minimumNoteGap of [-0.1, Infinity, NaN]) expect(() => render(source, { minimumNoteGap })).toThrow('最小音符间距')
  })

it('packs Liang Liang into eight complete systems using minimum spacing', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/liang_liang_01.m3n'), 'utf8')
    const tight = render(source, { width: 704, pageMargin: 8, coreGap: 22, minimumNoteGap: 4.4 })
    const systems = [...tight.root.querySelectorAll('g.system')]
    const firstMeasures = [...new Set([...systems[0]!.querySelectorAll('g.note[data-m3n-measure]')].map(node => node.getAttribute('data-m3n-measure')))]
    expect(firstMeasures.slice(0, 3)).toEqual(['m3n-measure-1-1', 'm3n-measure-1-2', 'm3n-measure-1-3'])
    expect(new Set([...tight.root.querySelectorAll('g.measure')].map(node => node.getAttribute('data-m3n-measure-id'))).size).toBe(36)
    expect(systems.length).toBeLessThanOrEqual(8)
    expect(tight.score.diagnostics).toEqual([])
    const normal = render(source, { width: 704, pageMargin: 8, minimumNoteGap: 4.4 })
    const content = (root: Document) => [...root.querySelectorAll('g.note,text[data-m3n-role="lyric"]')]
      .map(node => [node.getAttribute('data-m3n-id'), node.getAttribute('data-m3n-rendition'), node.textContent])
    expect(content(tight.root)).toEqual(content(normal.root))
    const slots = (root: Document) => [...root.querySelectorAll('g[data-m3n-role="lyric-fragment"]')]
      .map(node => [node.getAttribute('data-m3n-id'), node.getAttribute('data-m3n-rendition'), node.getAttribute('data-m3n-passes')])
    expect(slots(tight.root)).toEqual(slots(normal.root))
  })

it('uses a single minimum 9px clearance without changing score content', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/liang_liang_01.m3n'), 'utf8')
    const paired = render(source, { width: 716, pageMargin: 8, coreGap: 22, minimumNoteGap: 9 })
    const normal = render(source, { width: 716 })
    const content = (root: Document) => [...root.querySelectorAll('g.note,text[data-m3n-role="lyric"]')]
      .map(node => [node.getAttribute('data-m3n-id'), node.getAttribute('data-m3n-rendition'), node.textContent])
    expect(content(paired.root)).toEqual(content(normal.root))
    expect(paired.score.diagnostics).toEqual([])
    for (const minimumNoteGap of [-1, Infinity, NaN]) expect(() => render(source, { minimumNoteGap })).toThrow('最小音符间距')
  })

it('expands the first verse and repeats the remaining verses and chorus three times in Tomorrow Will Be Better', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/ming_tian_hui_geng_hao_01.m3n'), 'utf8')
    const { document, root, score } = render(source, { width: 786, pageMargin: 8, coreGap: 18 })
    const measures = [...document.parts.values()][0]!.melody.filter(measure => measure.events.length)
    const passes = measurePlaybackPasses(measures)
    expect([...passes.get(measures[0]!)!]).toEqual([1])
    expect(measures.every(measure => !measure.ending)).toBe(true)
    const repeatStart = measures.findIndex(measure => measure.left === 'rptstart')
    expect(repeatStart).toBe(10)
    expect([...passes.get(measures[repeatStart]!)!]).toEqual([1, 2, 3])
    expect([...passes.get(measures[20]!)!]).toEqual([1, 2, 3])
    const sharedChorus = measures.slice(21, 25).flatMap(measure => measure.events)
    const ids = scoreEventIds(document)
    const rows = sharedChorus.flatMap(event => [...root.querySelectorAll(`text[data-m3n-role="lyric"][data-m3n-id="${ids.get(event)}"]`)]
      .map(node => node.getAttribute('data-m3n-rendition')))
    expect(new Set(rows)).toEqual(new Set(['1']))
    expect(score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
  })

it('reduces system spacing without changing notes, lyrics or event identities', () => {
    const source = '{4/4}\nN: 1~ 1 2 3 | {br} 4 5 6 7 | {br} 1e 7 6 5 | {br} 4 3 2 1 |||\nL: 春天花开山间流水清风明月故乡'
    const normal = render(source)
    const compact = render(source, { coreGap: 18, pageMargin: 8 })
    const height = (root: Document) => Number(root.querySelector('svg')!.getAttribute('height'))
    const events = (root: Document) => [...root.querySelectorAll('g.note')].map(node => [node.getAttribute('data-m3n-id'), node.textContent])
    expect(height(compact.root)).toBeLessThan(height(normal.root))
    expect(compact.root.querySelectorAll('g.system')).toHaveLength(normal.root.querySelectorAll('g.system').length)
    expect(events(compact.root)).toEqual(events(normal.root))
    expect([...compact.root.querySelectorAll('[data-m3n-role="lyric"]')].map(node => node.textContent))
      .toEqual([...normal.root.querySelectorAll('[data-m3n-role="lyric"]')].map(node => node.textContent))
    expect(compact.score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
  })

it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid compact spacing %s', value => {
    expect(() => render('N: 1 2 3 4 |||', { coreGap: value })).toThrow('非负有限数值')
    expect(() => render('N: 1 2 3 4 |||', { pageMargin: value })).toThrow('非负有限数值')
  })

it('uses the native engine and embedded font with stable interactive measure structure', () => {
    const { pages, root } = render('{title=测试曲} {key=D} {3/4} {90qpm}\nN: ||: 1 2 3 | 4 5 6 :|||\nL: 春天来了花开')
    expect(root.querySelector('svg')?.getAttribute('data-engine')).toBe('m3n')
    expect(root.querySelector('g.system g.measure #m3n-e-1')).not.toBeNull()
    expect(root.querySelector('.measure')?.getAttribute('data-m3n-measure-start')).not.toBeNull()
    expect(pages[0]).toContain('data:font/ttf;base64,')
    expect(pages[0]).not.toContain('shuzi_b_bian')
    expect(root.body.textContent).toContain('测试曲')
  })

it('renders solely from ScoreDocument without reading its source text', () => {
    const document = parseM3NDocument('{2/4}\nN: 1 2 | 3 4 |||\nL: 春天来了')
    const before = render(document).pages
    Object.defineProperty(document, 'source', { get() { throw new Error('engraving must not read source text') } })
    expect(render(document).pages).toEqual(before)
  })

it('shares every source event ID, including bass and tuplet children', () => {
    const source = '{4/4}\nN: [123:2] 4 5 | 6 7 1e 2e |||\nB: 1 2 3 4 | 5 6 7 1e |||'
    const { root, document } = render(source)
    const interaction = deriveScoreInteraction(document)
    for (const id of scoreEventIds(document).values()) {
      expect(interaction.sourceMap.some(item => item.xmlId === id)).toBe(true)
      expect(root.querySelector(`[data-m3n-id="${id}"]`)).not.toBeNull()
    }
    expect(root.querySelector('#m3n-e-1-n3')).not.toBeNull()
    const ids = [...root.querySelectorAll('[id]')].map(node => node.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

it('keeps event IDs stable when the export excludes the bass staff', () => {
    const source = '{2/4}\nN: 1 2 | 3 4 |||\nB: 1d 2d | 3d 4d |||'
    const withBass = render(source), withoutBass = render(source, { includeBass: false })
    expect(withoutBass.root.querySelector('#m3n-e-5')).not.toBeNull()
    expect(withoutBass.root.querySelector('#m3n-e-3')).toBeNull()
    expect(withBass.root.querySelector('#m3n-e-3')).not.toBeNull()
  })

it('renders long rests without sustain marks or duplicate DOM IDs', () => {
    const { root } = render('{4/4}\nN: 0^ 1 2 |||\nL: 春天')
    expect(numbers(root, 'm3n-e-1')).toBe('00')
    expect(root.querySelectorAll('#m3n-e-1')).toHaveLength(1)
    expect(lyrics(root, 'm3n-e-2')).toBe('春')
    expect(lyrics(root, 'm3n-e-3')).toBe('天')
  })

it('uses Bravura characters for staccato and accent', () => {
    const { root } = render('{2/4}\nN: 1e{tip} 1e{str} |||')
    const wedge = root.querySelector('#m3n-e-1 [data-m3n-mark="tip"] text')!
    const accent = root.querySelector('#m3n-e-2 [data-m3n-mark="str"] text')!
    expect(wedge.getAttribute('fill')).toBe('#000')
    expect(wedge.textContent).toBe('\uF47B')
    expect(accent.getAttribute('fill')).toBe('#000')
    expect(accent.getAttribute('data-m3n-font')).toBe('Bravura')
    expect(accent.textContent).toBe('\uE4A0')
  })

it('retains text directives, section labels and chord annotations together', () => {
    const source = '{4/4}\n===练习\nN: {text=说明} {chord=C} 1 2 3 4 |||'
    const { root } = render(source)
    expect(root.body.textContent).toContain('练习')
    expect(root.body.textContent).toContain('说明')
    expect(root.body.textContent).toContain('C')
  })

it('retains octave intervals and transposes each chord pitch visually', () => {
    const base = render('{4/4}\nN: [135:h] 2 3 4 |||')
    const shifted = render('{4/4}\nN: {8va}[135:h] 2 3 4{/} |||')
    expect(shifted.root.querySelector('#m3n-e-1')!.querySelectorAll('[data-m3n-role="music-dot"]').length).toBeGreaterThan(base.root.querySelector('#m3n-e-1')!.querySelectorAll('[data-m3n-role="music-dot"]').length)
    expect(numbers(shifted.root, 'm3n-e-1')).toBe('135')
  })

it('preserves underlined lyric groups without underlining neighboring syllables', () => {
    const { root } = render('{4/4}\nN: 1 2 3 4 |||\nL: (起来，)春(天里)好')
    const groups = [...root.querySelectorAll('text[data-m3n-underlined="true"]')]
    expect(groups.map(node => node.textContent)).toEqual(['起来，', '天里'])
    expect(root.querySelector('text[data-m3n-id="m3n-e-2"][data-m3n-underlined]')).toBeNull()
  })

it('preserves tempo, key and meter changes at their musical positions', () => {
    const { root } = render('{key=C} {4/4} {90qpm}\nN: 1 2 3 4 | {120qpm} {key=Bb} {3/4} 5 6 7 |||')
    expect(root.body.textContent).toContain('90')
    expect(root.body.textContent).toContain('120')
    expect(root.body.textContent).toContain('B')
    expect(root.body.textContent).toContain('3')
  })

it('renders the number of complete-bar rests and excludes them from interval endpoints', () => {
    const { root, score } = render('{4/4}\nN: {lg}1 2 3 4{/} | {rest=2} | 4 3 2 1 |||')
    expect(root.querySelectorAll('g.measure')).toHaveLength(3)
    expect(root.body.textContent).toContain('2')
    expect(score.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  })

it('renders leading grace notes and keeps them inside the main event group', () => {
    const { root } = render('{4/4}\nN: 1{ac(7d)} 2{ap((35))} 3 4 |||')
    expect(numbers(root, 'm3n-e-1')).toContain('7')
    expect(numbers(root, 'm3n-e-2')).toContain('35')
    expect(root.querySelector('#m3n-e-1')?.querySelectorAll('text[font-family="Barlow Semi Condensed"]').length).toBe(2)
  })

it('expands tuplets sequentially with per-note lyrics and a shared playback identity', () => {
    const { root } = render('{4/4}\nN: [123:2] 4 5 |||\nL: 春夏秋冬天')
    expect(lyrics(root, 'm3n-e-1')).toBe('春夏秋')
    expect(numbers(root, 'm3n-e-1')).toBe('123')
    expect(root.querySelectorAll('[id^="m3n-e-1-n"]')).toHaveLength(3)
  })

it('engraves internal tuplet ties and places lyrics only on the attacked children', () => {
    const { root } = render('{2/4}\nN: ([3~ 3 3:2]) ([5 5~ 5:2]) |||\nL: 春夏秋冬')
    expect(lyrics(root, 'm3n-e-1')).toBe('春夏')
    expect(lyrics(root, 'm3n-e-2')).toBe('秋冬')
    expect(root.querySelectorAll('path[data-m3n-relation="tie"]')).toHaveLength(2)
  })

it('keeps lyrics on the first tied event and skips instrumental passages', () => {
    const tied = render('{4/4}\nN: 1~ 1 2 3 |||\nL: 春天地')
    expect(lyrics(tied.root, 'm3n-e-1')).toBe('春')
    expect(lyrics(tied.root, 'm3n-e-2')).toBe('')
    expect(lyrics(tied.root, 'm3n-e-3')).toBe('天')
    const instrumental = render('{4/4}\nN: {inst}1 2{/} 3 4 |||\nL: 春天')
    expect(lyrics(instrumental.root, 'm3n-e-3')).toBe('春')
  })

it('retains empty lyric slots and playback pass metadata across repeat verses', () => {
    const { root } = render('{2/4}\nN: ||: 1 2 | 3 4 :|||\nL1: 春天\nL2: 花开满园')
    expect(root.querySelector('text[data-m3n-id="m3n-e-3"][data-m3n-rendition="1"]')).toBeNull()
    const empty = root.querySelector('g[data-m3n-role="lyric-fragment"][data-m3n-id="m3n-e-3"][data-m3n-rendition="1"]')!
    expect(empty.getAttribute('data-m3n-passes')).toBe('1')
    expect(empty.childElementCount).toBe(0)
    expect(lyrics(root, 'm3n-e-3', 1)).toBe('')
    expect(lyrics(root, 'm3n-e-3', 2)).toBe('满')
    expect(root.querySelector('text[data-m3n-rendition="2"]')?.getAttribute('data-m3n-passes')).toContain('2')
  })

it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('labels continuous shared verses once at width $width, paged=$paged', ({ width, paged }) => {
    const source = '{2/4}\nN: ||: 1 2 | 3 4 |\nL1: 甲乙丙丁\nL2: 春夏秋冬\nL3: {L2}\n---\nN: 5 6 | 7 1e :|||{x3}\nL1: 戊己庚辛\nL2: 风花雪月\nL3: {L2}'
    const { root, score } = render(source, { width, paged })
    expect(score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
    const prefixes = [...root.querySelectorAll('text[data-m3n-role="lyric-prefix"]')]
    expect(prefixes.map(node => node.textContent)).toEqual(['1.', '2.3.'])
    const id = prefixes[0]!.getAttribute('data-m3n-id')!
    const syllables = [1, 2].map(row => root.querySelector(`text[data-m3n-role="lyric"][data-m3n-id="${id}"][data-m3n-rendition="${row}"]`)!)
    expect(syllables.map(node => node.textContent)).toEqual(['甲', '春'])
    expect(new Set(syllables.map(node => node.getAttribute('x'))).size).toBe(1)
    expect(prefixes[1]!.getAttribute('data-m3n-passes')).toBe('2-3')
    for (const [i,prefix] of prefixes.entries()) {
      expect(Number(prefix.getAttribute('x'))).toBeLessThan(Number(syllables[i]!.getAttribute('x')))
      expect(prefix.getAttribute('y')).toBe(syllables[i]!.getAttribute('y'))
    }
  })

it.each([320, 800].flatMap(width => [false, true].map(paged => ({ width, paged }))))('omits all-visit shared lyric prefixes at width $width, paged=$paged', ({ width, paged }) => {
    const { root, score } = render('{2/4}\nN: ||: 1 2 | 3 4 :|||{x3}\nL1: 春风吹来\nL2: {L1}\nL3: {L1}', { width, paged })
    expect(score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
    expect(root.querySelectorAll('text[data-m3n-role="lyric-prefix"]')).toHaveLength(0)
    const syllables = [...root.querySelectorAll('text[data-m3n-role="lyric"]')]
    expect(syllables.map(node => node.textContent).join('')).toBe('春风吹来')
    expect(syllables.every(node => node.getAttribute('data-m3n-passes') === '1-2-3')).toBe(true)
  })

it('attaches verse labels to the first visible syllable after skipped slots', () => {
    const { root } = render('{2/4}\nN: 1 2 :|||{x3}\nL1: %甲\nL2: (乙丙)丁\nL3: {L2}\n---\nN: 3 4 |||\nL: 戊己')
    const prefixes = [...root.querySelectorAll('text[data-m3n-role="lyric-prefix"]')]
    expect(prefixes.sort((a,b)=>Number(a.getAttribute('data-m3n-rendition'))-Number(b.getAttribute('data-m3n-rendition'))).map(node => [node.textContent, node.getAttribute('data-m3n-id')])).toEqual([
      ['1.', 'm3n-e-2'], ['2.3.', 'm3n-e-1'],
    ])
    expect(lyrics(root, 'm3n-e-1', 2)).toBe('乙丙')
    expect(root.querySelector('text[data-m3n-role="lyric-prefix"][data-m3n-underlined]')).toBeNull()
    expect(root.querySelector('text[data-m3n-id="m3n-e-3"][data-m3n-role="lyric-prefix"]')).toBeNull()
  })

it('carries a pending verse label across a phrase containing only skipped slots', () => {
    const { root } = render('{2/4}\nN: ||: 1 2 |\nL1: %%\nL2: 甲乙\nL3: {L2}\n---\nN: 3 4 :|||{x3}\nL1: 丙丁\nL2: 戊己\nL3: {L2}')
    const prefixes = [...root.querySelectorAll('text[data-m3n-role="lyric-prefix"]')]
    expect(prefixes.sort((a,b)=>Number(a.getAttribute('data-m3n-rendition'))-Number(b.getAttribute('data-m3n-rendition'))).map(node => [node.textContent, node.getAttribute('data-m3n-id')])).toEqual([
      ['1.', 'm3n-e-3'], ['2.3.', 'm3n-e-1'],
    ])
  })

it.each([
    ['changed verse grouping', '---\nN: 3 4 |\nL1: 庚辛\nL2: {L1}\nL3: 壬癸\n---', ''],
    ['music without lyrics', '---\nN: 3 4 |\n---', ''],
    ['instrumental music', '---\nN: {inst}3 4{/} |\n---', ''],
    ['whole-bar rests', '---\nN: {rest=2} |\n---', ''],
    ['a new section', '===新段', ''],
    ['a new repeat', '---', '||:'],
  ])('restarts verse labels after %s', (_reason, boundary, opening) => {
    const { root } = render(`{2/4}\nN: 1 2 |\nL1: 甲乙\nL2: 丙丁\nL3: {L2}\n${boundary}\nN: ${opening} 5 6 :|||{x3}\nL1: 戊己\nL2: 子丑\nL3: {L2}`)
    const prefixes = [...root.querySelectorAll('text[data-m3n-role="lyric-prefix"]')]
    expect(prefixes.filter(node => node.textContent === '2.3.').map(node => lyrics(root, node.getAttribute('data-m3n-id')!, 2))).toEqual(['丙', '子'])
  })

it('retains repeat boundaries, navigation and volta numbers without phantom measures', () => {
    const { root } = render('{2/4}\nN: ||: {segno}1 2 |\n---V1\nN: 3 4 :||\n---V2\nN: 5 6 {fine} |||')
    expect(root.querySelectorAll('g.measure')).toHaveLength(3)
    expect(root.body.textContent).toContain('1.')
    expect(root.body.textContent).toContain('2.')
    expect(root.body.textContent).toContain('Fine')
  })

it('starts a named section after a one-measure introduction on a new system', () => {
    const source = '{4/4}\n===序\nN:1 2 3 4 ||\n===主\nN:||:5 6 7 1e |1 2 3 4:|||'
    const { root } = render(source, { width: 1000 })
    const measures = [...root.querySelector('g.system')!.querySelectorAll('g.note')].map(node => node.getAttribute('data-m3n-measure'))
    expect([...new Set(measures)]).toEqual(['m3n-measure-1-1'])
    expect(root.querySelector('g.system')!.textContent).toContain('序')
    expect(root.querySelectorAll('g.system')[1]!.textContent).toContain('主')
  })

it('keeps first-verse L: after explicit numbered lyric rows', () => {
    const { root } = render('{2/4}\nN: ||: 1 2 | 3 4 :||\nL1: 春天来了\nL2: 花开满园\n---\nN: 5 6 |||\nL: 你好')
    expect(lyrics(root, 'm3n-e-5', 1)).toBe('你')
  })

it('respects named sections and explicit breaks while reflowing with width', () => {
    const source = '{4/4}\n===甲\nN: ' + Array(12).fill('1 2 3 4 |').join(' ') + '{br} 5 6 7 1e |\n===乙\nN: 1 2 3 4 |||'
    const narrow = render(source, { width: 320 }), wide = render(source, { width: 1000 })
    expect(narrow.root.querySelectorAll('g.system').length).toBeGreaterThan(wide.root.querySelectorAll('g.system').length)
    expect(wide.root.querySelectorAll('g.system').length).toBeGreaterThanOrEqual(3)
    expect(wide.root.querySelectorAll('#m3n-e-49')).toHaveLength(1)
  })

it('paginates complete systems and keeps every final lyric inside the page', () => {
    const source = '{4/4}\nN: ' + Array(60).fill('1 2 3 4 |').join(' ') + '\nL: ' + '春天花开'.repeat(60) + '\nL2: ' + '满园花香'.repeat(60)
    const { pages, root } = render(source, { width: 600, paged: true })
    expect(pages.length).toBeGreaterThan(1)
    expect(root.querySelectorAll('g.note')).toHaveLength(240)
    for (const svg of root.querySelectorAll('svg')) {
      const [x, y, width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number)
      expect(x).toBe(0); expect(width).toBe(600)
      for (const lyric of svg.querySelectorAll('text[data-m3n-role="lyric"]')) expect(Number(lyric.getAttribute('y'))).toBeLessThan(y! + height! - 20)
    }
  })

it('shows lyricist and composer on the right, singer as a subtitle, and rejects invalid widths', () => {
    const { root } = render('{title=曲名} {singer=演唱者} {composer=创作者} {lyricist=创作者} {arranger=编曲者} {4/4}\nN: 1 2 3 4 |||')
    const texts = [...root.querySelectorAll('text')]
    expect(texts.map(text => text.textContent)).toEqual(expect.arrayContaining(['创作者 词曲', '演唱者 演唱']))
    expect(texts.map(text => text.textContent)).not.toEqual(expect.arrayContaining(['创作者 作词', '创作者 作曲']))
    expect(texts.some(text => /编曲者|作词：|作曲：|演唱：/.test(text.textContent ?? ''))).toBe(false)
    expect(() => render('{4/4}\nN: 1 2 3 4 |||', { width: NaN })).toThrow()
  })

it('uses readable BPM labels for both header and in-score tempos', () => {
    const { root } = render('{96qpm} {4/4}\nN: 1 2 3 4 | {120qpm} 5 6 7 1e |||')
    const tempos = [...root.querySelectorAll('text')].filter(text => /^(96|120) BPM$/.test(text.textContent ?? ''))
    expect(new Set(tempos.map(text => text.textContent))).toEqual(new Set(['96 BPM', '120 BPM']))
    expect(tempos).toHaveLength(2)
    for (const tempo of tempos) expect(tempo.getAttribute('font-family')).toBe('Barlow Semi Condensed')
  })

it('reports unsupported marks instead of silently discarding them', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 |||')
    document.parts.values().next().value!.melody[0]!.events[0]!.postfixes.push('unknown')
    expect(render(document).score.diagnostics.some(item => item.code === 'NUMBERED_UNSUPPORTED_MARK')).toBe(true)
  })

it.each([320,800])('prints ordered houses once without duplicating their shared lyric labels at %s', width => {
  const source='{2/4}{order=A,B,A,A}\n===A\nN: 1 2 |\nL: 甲乙\n---V1\nN: 3 4 ||\nL: 丙丁\n---V2,V3\nN: 5 6 ||\nL: 戊己\n===B\nN: 7 1e |||'
  const {root,score}=render(source,{width})
  expect(score.diagnostics).toEqual([])
  expect(root.querySelectorAll('g.note')).toHaveLength(8)
  expect(root.querySelectorAll('text[data-m3n-role="lyric-prefix"]')).toHaveLength(0)
  expect(root.body.textContent).toContain('2.3.') // The house bracket retains the visit labels.
  expect([...root.querySelectorAll('text[data-m3n-role="lyric"]')].map(node=>node.textContent).join('')).toBe('甲乙丙丁戊己')
})

it('renders a traditional tune origin without a composer label', () => {
  const { root } = render('{title=民歌}{origin=爱尔兰传统民歌}{4/4}\nN: 1 2 3 4 |||')
  const texts = [...root.querySelectorAll('text')].map(text => text.textContent)
  expect(texts).toContain('爱尔兰传统民歌')
  expect(texts).not.toContain('作曲：')
})

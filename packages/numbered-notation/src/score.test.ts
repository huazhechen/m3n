// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { ASTFunctionNode, RecordingPainter, compileScore, getLayoutBounds, isVisualTemporalNode, type VisualTemporalNode } from '@m3n/jpfun'
import { formatM3N, measurePlaybackPasses, m3nToMei, parseM3NDocument, scoreEventIds, type ScoreDocument } from '@m3n/notation'
import { NumberedNotationScore, type NumberedNotationRenderOptions } from './score.js'
import { projectNumberedScore } from './projection.js'
import { nativeArcSlice } from './native-curve.js'

const options = { paged: false, width: 800 }

it('keeps slur clearance and drawing order independent of source whitespace', () => {
  const source = '{4/4}\nN: {lg}1             2{/} {lg}3 4{/} | {lg}((1)) ((2)) ((3)) ((4)){/} 5 6 7 |||'
  const formatted = formatM3N(source)
  expect(formatted).not.toBe(source)
  for (const width of [320, 800]) for (const paged of [false, true]) {
    expect(render(formatted, { width, paged }).pages).toEqual(render(source, { width, paged }).pages)
  }
})

it('renders compound-meter underlines in threes in melody and bass', () => {
  const document = parseM3NDocument('{6/8}\nN: (1 2 3 4 5 6) |||\nB: (1d 2d 3d 4d 5d 6d) |')
  const projection = projectNumberedScore(document, options)
  const result = compileScore(projection.source, { autoWrap: true })
  expect(result.diagnostics).toEqual([])
  const beams = result.layout.attachments.flatMap(attachment => {
    if (!attachment.sourceSpan) return []
    const source = projection.source.slice(attachment.sourceSpan.start, attachment.sourceSpan.end)
    return source.startsWith('@div(') ? [[...source.matchAll(/@note\("([^"]+)"\)/g)].map(match => match[1])] : []
  })
  expect(beams).toEqual([['1', '2', '3'], ['1,', '2,', '3,'], ['4', '5', '6'], ['4,', '5,', '6,']])
})

function render(source: string | ScoreDocument, settings: Partial<NumberedNotationRenderOptions> = {}) {
  const document = typeof source === 'string' ? parseM3NDocument(source) : source
  const score = NumberedNotationScore.create(document)
  const pages = score.render({ ...options, ...settings })
  const root = new DOMParser().parseFromString(`<main>${pages.join('')}</main>`, 'text/html')
  return { pages, root, score, document }
}
function numbers(root: Document, id: string) {
  return [...root.querySelectorAll(`g.note[data-m3n-id="${id}"] text`)].map(text => text.textContent).join('')
}
function lyrics(root: Document, id: string, row = 1) {
  return [...root.querySelectorAll(`text[data-m3n-role="lyric"][data-m3n-id="${id}"][data-m3n-rendition="${row}"]`)].map(text => text.textContent?.replaceAll('\u200B', '')).join('')
}
function geometry(document: ScoreDocument, settings: NumberedNotationRenderOptions = options) {
  const projection = projectNumberedScore(document, settings)
  return compileScore(projection.source, { systemSpacing: { coreGap: settings.systemGap ?? 24, inkGap: (settings.systemGap ?? 24) / 2 }, autoWrap: true, alignRelations: true, noteGap: 22 * (settings.noteGapEm ?? 0.6), minimumNoteGap: settings.minimumNoteGapEm === undefined ? (settings.noteGapEm === undefined ? 8.8 : undefined) : 22 * settings.minimumNoteGapEm, uniformSystemHeight: settings.uniformSystemHeight, equalMeasures: settings.equalMeasures ?? document.equalMeasures })
}

function mainPitches(node: VisualTemporalNode): { name: string; acc: string; octave: number }[] {
  const compound = node as VisualTemporalNode & { host?: VisualTemporalNode; members?: readonly VisualTemporalNode[]; name?: string; acc?: string; octave?: number }
  if (compound.name !== undefined) return [{ name: compound.name, acc: compound.acc ?? '', octave: compound.octave ?? 0 }]
  if (compound.host) return mainPitches(compound.host) // Grace notes do not replace the main pitch.
  return (compound.members ?? []).filter(member => !member.T.isZero()).flatMap(mainPitches)
}

const corpusFiles = readdirSync(resolve(process.cwd(), '../../src/scores')).filter(name => name.endsWith('.m3n')).sort()

describe('jpFun numbered notation adapter', () => {
  it.each([320,800].flatMap(width=>[false,true].map(paged=>({width,paged}))))('engraves an alternative with its own lyrics and pass-specific note bindings at $width, paged=$paged', settings=>{
    const source='{2/4}\nN: ||: 1 2 | 3 4 :||\nL1: 甲乙 | 丙丁\nL2: 戊己 | 庚辛壬\nNs[2]: 2: (5 6) 7 |'
    const {root,score,document}=render(source,settings)
    expect(score.diagnostics.filter(item=>item.severity==='error')).toEqual([])
    const native=geometry(document,{...options,...settings})
    expect(native.diagnostics.filter(item=>item.severity==='error')).toEqual([])
    const alt=document.alternatives![0]!,ids=scoreEventIds(document)
    for (const [index,event] of alt.measure.events.entries()) {
      const id=ids.get(event)!
      expect(root.querySelector(`g.note[data-m3n-id="${id}"]`)?.getAttribute('data-m3n-passes')).toBe('2')
      expect(lyrics(root,id,2)).toBe(['庚','辛','壬'][index])
    }
    const first=alt.measure.events[0]!,host=alt.host.events[0]!
    const note=(event:typeof first)=>native.layout.objects.find(node=>node.ast instanceof ASTFunctionNode && node.ast.label=== [...projectNumberedScore(document,{...options,...settings}).bindings.values()].find(b=>b.event===event)!.label)!
    expect(note(first).box.y).toBeGreaterThan(note(host).box.y)
    expect(root.body.textContent).not.toContain('2.')
    expect(root.body.textContent).toContain('(')
    expect(root.querySelectorAll('g.note')).toHaveLength(7)
  })

  it('hides repeated accidental glyphs within a bar while retaining their full pitch and resetting at barlines', () => {
    const source = '{4/4}\nN: 4# 4# 4= 4= | 4# 4# 4#e 4#e | [4#4#4=:2] 4# 0 |||'
    const projection = projectNumberedScore(parseM3NDocument(source), options)
    expect(projection.source.match(/showacc=false/g)).toHaveLength(5)
    const native = geometry(parseM3NDocument(source)).layout.objects.filter(node => !node.T.isZero())
    expect(mainPitches(native[0]!)[0]!.acc).toBe('#')
    expect(mainPitches(native[1]!)[0]!.acc).toBe('#')
    expect(projection.source).toContain('@note("#4",showacc=false)')
    expect(projection.source).toContain('@note("n4",showacc=false)')
  })

  it.each([320, 800])('prints section order once and keeps local verse identities at width %s', width => {
    const source = '{2/4}{order=A,A,B,A,C1,B,A,C2}\n===A\nN: 1 2 ||\nL1: 甲乙\nL2: 丙丁\nL3: 戊己\nL4: 庚辛\n===B\nN: 3 4 ||\n===C1\nN: 5 6 ||\n===C2\nN: 7 1e |||'
    const { root, score, document } = render(source, { width })
    expect(score.diagnostics).toEqual([])
    expect(root.body.textContent).toContain('演奏顺序：')
    // Eight ordered occurrences plus four section labels have native frames.
    expect(root.querySelectorAll('rect[stroke="#000"]')).toHaveLength(12)
    const framed = projectNumberedScore(document, { ...options, width }).source
    expect(framed.match(/size=16px,weight=700,frame=true/g)).toHaveLength(8)
    expect(root.querySelectorAll('g.note')).toHaveLength(8)
    const first = [...document.parts.values()][0]!.melody[0]!.events[0]!
    const id = scoreEventIds(document).get(first)!
    expect([1, 2, 3, 4].map(row => lyrics(root, id, row))).toEqual(['甲', '丙', '戊', '庚'])
    expect(geometry(document, { ...options, width }).diagnostics).toEqual([])
  })

  it('accepts complementary pickups at repeats without hiding invalid meter', () => {
    const valid = render('{3/8}\nN: ||: ((3e 2#e)) | ((3e 2#e 3e 7 2=e 1e)) |\n---V1\nN: 6 :||\n---V2\nN: 6 |||')
    expect(valid.score.diagnostics).toEqual([])
    const invalid = render('{3/8}\nN: (1 2 3) | 4 | (5 6 7) |||')
    expect(invalid.score.diagnostics.map(item => item.code)).toContain('W_METER_MISMATCH')
  })

  it('reflows Qiu Ying independently of font size while retaining event identities', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/qiu_ying_01.m3n'), 'utf8')
    const settings = { width: 590, pageMargin: 8, systemGap: 18, uniformSystemHeight: true }
    const normal = render(source, settings)
    const reflowed = render(source, { ...settings, wrapWidthRatio: 0.9 })
    expect(reflowed.root.querySelectorAll('g.system').length).toBeGreaterThan(normal.root.querySelectorAll('g.system').length)
    const notes = (root: Document) => [...root.querySelectorAll('g.note')].map(node => [node.getAttribute('data-m3n-id'), node.textContent])
    expect(notes(reflowed.root)).toEqual(notes(normal.root))
    expect(reflowed.root.querySelector('g.note text')?.getAttribute('font-size')).toEqual(normal.root.querySelector('g.note text')?.getAttribute('font-size'))
    expect(reflowed.score.diagnostics).toEqual([])
    for (const wrapWidthRatio of [0, -1, 1.1, NaN, Infinity]) expect(() => render(source, { wrapWidthRatio })).toThrow('wrapWidthRatio')
  })
  it.each([false, true])('uses the paired spacing by default in paged=%s layouts', paged => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/liang_liang_01.m3n'), 'utf8')
    for (const width of [320, 800]) {
      const defaults = render(source, { width, paged })
      expect(defaults.pages).toEqual(render(source, { width, paged, minimumNoteGapEm: 0.4, noteGapEm: 0.6 }).pages)
      expect(defaults.pages).toEqual(render(source, { width, paged, wrap: 'compact' }).pages)
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
  it('passes compact wrapping through for sparse exercise measures without changing event identities', () => {
    const source = '{equal-measures=true}\n{4/4}\nN: ' + Array(10).fill('1^^ |').join(' ')
    const normal = render(source, { width: 800, noteGapEm: 1.2 })
    const compact = render(source, { width: 800, noteGapEm: 1.2, wrap: 'compact' })
    expect(compact.root.querySelectorAll('g.system').length).toBeLessThan(normal.root.querySelectorAll('g.system').length)
    expect([...compact.root.querySelectorAll('g.note')].map(node => [node.getAttribute('data-m3n-id'), node.textContent]))
      .toEqual([...normal.root.querySelectorAll('g.note')].map(node => [node.getAttribute('data-m3n-id'), node.textContent]))
    expect(compact.score.diagnostics).toEqual([])
  })
  it('packs Liang Liang more closely while preserving every note, lyric, tie and source identity', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/liang_liang_01.m3n'), 'utf8')
    const normal = render(source, { width: 760, noteGapEm: 0.6 })
    const compact = render(source, { width: 760, noteGapEm: 0.6, wrap: 'compact' })
    expect(compact.root.querySelectorAll('g.system').length).toBeLessThan(normal.root.querySelectorAll('g.system').length)
    const content = (root: Document) => [...root.querySelectorAll('g.note,text[data-m3n-role="lyric"]')]
      .map(node => [node.getAttribute('data-m3n-id'), node.getAttribute('data-m3n-rendition'), node.textContent])
    expect(content(compact.root)).toEqual(content(normal.root))
    expect(compact.root.querySelectorAll('g.note text[font-size="22"]').length)
      .toEqual(normal.root.querySelectorAll('g.note text[font-size="22"]').length)
    expect(compact.document).toEqual(normal.document)
    expect(compact.score.diagnostics).toEqual([])
  })
  it('supports 0.2em note gaps without changing Liang Liang content or font sizes', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/liang_liang_01.m3n'), 'utf8')
    const normal = render(source, { width: 760 })
    const tight = render(source, { width: 760, noteGapEm: 0.2 })
    const content = (root: Document) => [...root.querySelectorAll('g.note,text[data-m3n-role="lyric"]')]
      .map(node => [node.getAttribute('data-m3n-id'), node.getAttribute('data-m3n-rendition'), node.textContent])
    expect(content(tight.root)).toEqual(content(normal.root))
    expect(tight.pages).not.toEqual(normal.pages)
    expect(tight.score.diagnostics).toEqual([])
    expect(tight.root.querySelectorAll('g.note text[font-size="22"]').length)
      .toEqual(normal.root.querySelectorAll('g.note text[font-size="22"]').length)
    for (const noteGapEm of [-0.1, Infinity, NaN]) expect(() => render(source, { noteGapEm })).toThrow('音符间距比例')
  })
  it('adds a fourth measure to Liang Liang’s loose first system in compact mode', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/liang_liang_01.m3n'), 'utf8')
    const tight = render(source, { width: 704, pageMargin: 8, systemGap: 22, uniformSystemHeight: true, noteGapEm: 0.2, wrap: 'compact' })
    const systems = [...tight.root.querySelectorAll('g.system')]
    const firstMeasures = [...new Set([...systems[0]!.querySelectorAll('g.note[data-m3n-measure]')].map(node => node.getAttribute('data-m3n-measure')))]
    expect(firstMeasures).toEqual(['m3n-measure-1-1', 'm3n-measure-1-2', 'm3n-measure-1-3', 'm3n-measure-1-4'])
    expect(systems.length).toBeLessThanOrEqual(8)
    expect(tight.score.diagnostics).toEqual([])
    const normal = render(source, { width: 704, pageMargin: 8, noteGapEm: 0.2 })
    const content = (root: Document) => [...root.querySelectorAll('g.note,text[data-m3n-role="lyric"]')]
      .map(node => [node.getAttribute('data-m3n-id'), node.getAttribute('data-m3n-rendition'), node.textContent])
    expect(content(tight.root)).toEqual(content(normal.root))
  })
  it('uses minimum 0.4 and natural 0.6 clearances without changing score content', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/liang_liang_01.m3n'), 'utf8')
    const paired = render(source, { width: 716, pageMargin: 8, systemGap: 22, minimumNoteGapEm: 0.4, noteGapEm: 0.6 })
    const normal = render(source, { width: 716 })
    const content = (root: Document) => [...root.querySelectorAll('g.note,text[data-m3n-role="lyric"]')]
      .map(node => [node.getAttribute('data-m3n-id'), node.getAttribute('data-m3n-rendition'), node.textContent])
    expect(content(paired.root)).toEqual(content(normal.root))
    expect(paired.score.diagnostics).toEqual([])
    for (const minimumNoteGapEm of [-1, Infinity, NaN, 0.7]) expect(() => render(source, { minimumNoteGapEm, noteGapEm: 0.6 })).toThrow('最小间距')
  })
  it('preserves every performed measure, lyric and tie in the local-repeat Slow Like You arrangement', () => {
    // Apply the corrected natural on 在 to both arrangements before comparing playback.
    const original = readFileSync(resolve(process.cwd(), 'test/fixtures/man-man-original.m3n'), 'utf8').replace('(6. (5))', '(6=. (5))')
    const compact = readFileSync(resolve(process.cwd(), '../../src/scores/man_man_xi_huan_ni_01.m3n'), 'utf8')
    const performed = (source: string) => {
      const result = m3nToMei(source)
      expect(result.diagnostics).toEqual([])
      const mei = new DOMParser().parseFromString(result.mei, 'text/xml')
      const visits = new Map<string, number>()
      const tieStarts = new Set([...mei.querySelectorAll('tie')].map(tie => tie.getAttribute('startid')!.slice(1)))
      const tieEnds = new Set([...mei.querySelectorAll('tie')].map(tie => tie.getAttribute('endid')!.slice(1)))
      const canonical = (node: Element, pass: number): unknown => {
        const verses = [...node.children].filter(child => child.localName === 'verse')
        const verse = verses.find(child => Number(child.getAttribute('n')) === pass) ?? (verses.length === 1 ? verses[0] : undefined)
        const id = node.getAttribute('xml:id') ?? ''
        return {
          name: node.localName,
          attributes: [...node.attributes].filter(attribute => attribute.name !== 'xml:id').map(attribute => [attribute.name, attribute.value]).sort(),
          lyric: verse?.textContent?.replaceAll('\u200B', '') ?? '',
          tieStart: tieStarts.has(id), tieEnd: tieEnds.has(id),
          children: [...node.children].filter(child => child.localName !== 'verse').map(child => canonical(child, pass)),
        }
      }
      return mei.querySelector('expansion')!.getAttribute('plist')!.split(' ').flatMap(ref => {
        const count = (visits.get(ref) ?? 0) + 1
        visits.set(ref, count)
        const segment = [...mei.querySelectorAll('section,ending')].find(node => node.getAttribute('xml:id') === ref.slice(1))!
        return [...segment.querySelectorAll('measure')].flatMap(measure => [...measure.querySelector('layer')!.children].map(event => canonical(event, count)))
      })
    }
    const expected = performed(original)
    expect(expected.length).toBeGreaterThan(100)
    expect(performed(compact)).toEqual(expected)
    const { document, score } = render(compact, { width: 736, pageMargin: 8, systemGap: 0, showCredits: false, uniformSystemHeight: true })
    const measures = [...document.parts.values()][0]!.melody.filter(measure => measure.events.length)
    expect(document.order).toBeUndefined()
    expect(document.sections ?? []).toEqual([])
    expect(measures).toHaveLength(37)
    const passes = measurePlaybackPasses(measures)
    expect([0, 11, 22, 33].map(index => [...passes.get(measures[index]!)!])).toEqual([[1], [1, 2], [1, 2], [1]])
    expect(score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
  })

  it('keeps four verses and three compact chorus passes in Tomorrow Will Be Better', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/ming_tian_hui_geng_hao_01.m3n'), 'utf8')
    const { document, root, score } = render(source, { width: 786, pageMargin: 8, systemGap: 18, showCredits: false, uniformSystemHeight: true })
    const measures = [...document.parts.values()][0]!.melody.filter(measure => measure.events.length)
    const passes = measurePlaybackPasses(measures)
    expect([...passes.get(measures[0]!)!]).toEqual([1, 2, 3, 4])
    expect([...passes.get(measures[13]!)!]).toEqual([1, 2, 3])
    const mei = new DOMParser().parseFromString(m3nToMei(source).mei, 'text/xml')
    const sequence = mei.querySelector('expansion')!.getAttribute('plist')!.split(' ')
    expect(sequence).toEqual([
      '#m3n-segment-1', '#m3n-ending-1',
      '#m3n-segment-1', '#m3n-ending-2', '#m3n-segment-2',
      '#m3n-segment-1', '#m3n-ending-2', '#m3n-segment-2',
      '#m3n-segment-1', '#m3n-ending-2', '#m3n-segment-2',
    ])
    const sharedChorus = measures.slice(14, 18).flatMap(measure => measure.events)
    const ids = scoreEventIds(document)
    const rows = sharedChorus.flatMap(event => [...root.querySelectorAll(`text[data-m3n-role="lyric"][data-m3n-id="${ids.get(event)}"]`)]
      .map(node => node.getAttribute('data-m3n-rendition')))
    expect(new Set(rows)).toEqual(new Set(['1']))
    expect(score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
  })

  const systemBaselines = (root: Document) => [...root.querySelectorAll('g.system')].map(system => {
    const digit = [...system.querySelectorAll('g.note[data-m3n-id^="m3n-e-"] text')].find(node => node.getAttribute('font-size') === '22' && /^[0-7]$/.test(node.textContent ?? ''))!
    return Number(digit.getAttribute('y'))
  })

  it('shares music height within each paragraph without propagating its heading', () => {
    const source = '{title=段内等行高} {4/4}\nN: {lg}1ee 2ee 3ee 4ee{/} | {br} 1 2 3 4 | {br} 1 2 3 4 |\n===B\nN: {br} 1 2 3 4 | {br} 1 2 3 4 | {br} 1 2 3 4 |||'
    const natural = render(source)
    const uniform = render(source, { uniformSystemHeight: true })
    const axes = systemBaselines(uniform.root)
    expect(axes).toHaveLength(6)
    expect(axes[2]! - axes[1]!).toBeCloseTo(axes[1]! - axes[0]!, 2)
    expect(axes[5]! - axes[4]!).toBeCloseTo(axes[4]! - axes[3]!, 2)
    expect(axes[1]! - axes[0]!).toBeGreaterThan(axes[4]! - axes[3]! + 5)
    const groups = [...uniform.root.querySelectorAll('g.system')].map(node => node.getAttribute('data-m3n-paragraph'))
    expect(new Set(groups.slice(0, 3)).size).toBe(1)
    expect(new Set(groups.slice(3)).size).toBe(1)
    expect(groups[0]).not.toBe(groups[3])
    expect([...uniform.root.querySelectorAll('g.note')].map(node => node.getAttribute('data-m3n-id')))
      .toEqual([...natural.root.querySelectorAll('g.note')].map(node => node.getAttribute('data-m3n-id')))
    expect(uniform.score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
  })

  it('adds only the visible lyric rows to the uniform music envelope', () => {
    const source = '{4/4}\nN: 1 2 3 4 | {br} 1ee 2ee 3ee 4ee | {br} 1dd 2dd 3dd 4dd | {br} 1 2 3 4 |||\nL: 春风花开春风花开春风花开春风花开\nL2: _ _ _ _ 山间流水 _ _ _ _ _ _ _ _'
    const { root, score } = render(source, { uniformSystemHeight: true })
    const axes = systemBaselines(root)
    expect(axes).toHaveLength(4)
    expect(axes[3]! - axes[2]!).toBeCloseTo(axes[1]! - axes[0]!, 2)
    expect(axes[2]! - axes[1]!).toBeGreaterThan(axes[1]! - axes[0]! + 15)
    expect([...root.querySelectorAll('text[data-m3n-role="lyric"]')].filter(node => node.textContent?.includes('山'))).toHaveLength(1)
    expect(score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
  })

  it.each(['turkish_march_01.m3n', 'valsentino_01.m3n', 'second_waltz_01.m3n'])('keeps each music spacing band consistent in %s', file => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores', file), 'utf8')
    const { root } = render(source, { uniformSystemHeight: true, includeBass: false })
    const axes = systemBaselines(root)
    expect(axes.length).toBeGreaterThan(3)
    const bands = new Map<string, number>()
    const systems = [...root.querySelectorAll('g.system')]
    for (let i = 1; i < axes.length; i++) {
      const paragraph = systems[i]!.getAttribute('data-m3n-paragraph')!
      if (paragraph !== systems[i - 1]!.getAttribute('data-m3n-paragraph')) continue
      const band = `${paragraph}:${systems[i]!.getAttribute('data-m3n-volta')}`
      const step = axes[i]! - axes[i - 1]!
      if (bands.has(band)) expect(step).toBeCloseTo(bands.get(band)!, 2)
      else bands.set(band, step)
    }
    expect(bands.size).toBeGreaterThan(0)
  })

  it.each([false, true])('keeps plain systems compact around a cross-system volta, lyrics=%s', withLyrics => {
    const music = '{4/4}\nN: ||: 1 2 3 4 | {br} 1 2 3 4 | {br}\n---V1\nN: 1 2 3 4 | {br} 1 2 3 4 | {br} 1 2 3 4 :|| {br}\n---V2\nN: 1 2 3 4 | {br}\n---\nN: 1 2 3 4 | {br} 1 2 3 4 |||'
    const source = withLyrics ? music
      .replace('---V1', 'L: 春风花开春风花开\nL2: _ _ _ _ 山间流水\n---V1')
      .replace('---V2', 'L: 春风花开春风花开春风花开\n---V2')
      .replace('---\nN:', 'L: 春风花开\n---\nN:')
      + '\nL: 春风花开春风花开' : music
    const { root, score } = render(source, { uniformSystemHeight: true })
    const systems = [...root.querySelectorAll('g.system')], y = systemBaselines(root)
    expect(systems.map(s => s.getAttribute('data-m3n-volta'))).toEqual(['false', 'false', 'true', 'true', 'true', 'true', 'false', 'false'])
    const rows = systems.map(s => new Set([...s.querySelectorAll('[data-m3n-role="lyric"]')].filter(n => n.textContent?.replaceAll('\u200B', '').trim()).map(n => n.getAttribute('y'))).size)
    const bands = new Map<string, number>()
    for (let i = 1; i < y.length; i++) {
      const key = `${rows[i - 1]}:${systems[i]!.getAttribute('data-m3n-volta')}`
      const step = y[i]! - y[i - 1]!
      if (bands.has(key)) expect(step).toBeCloseTo(bands.get(key)!, 2)
      else bands.set(key, step)
    }
    expect(bands.get(`${withLyrics ? 1 : 0}:true`)!).toBeGreaterThan(bands.get(`${withLyrics ? 1 : 0}:false`)! + 10)
    expect(score.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    const natural = render(source)
    expect([...root.querySelectorAll('g.note')].map(n => [n.getAttribute('data-m3n-id'), n.textContent]))
      .toEqual([...natural.root.querySelectorAll('g.note')].map(n => [n.getAttribute('data-m3n-id'), n.textContent]))
  })

  it('exposes each ending envelope on its own system for external pagination', () => {
    const source = '{4/4}\nN: ||: 1 2 3 4 | {br}\nL: 春风花开\nL2: 山间流水\n---V1\nN: 5 6 7 1e :|| {br}\n---V2\nN: 1e 7 6 5 |||'
    const settings = { ...options, pageMargin: 8, systemGap: 18, uniformSystemHeight: true }
    const { root, document } = render(source, settings)
    const native = geometry(document, settings)
    const projection = projectNumberedScore(document, settings)
    const ending = native.layout.attachments.find(attachment => attachment.sourceSpan
      && projection.source.slice(attachment.sourceSpan.start).startsWith('@volta('))!
    expect(ending).toBeDefined()
    expect(ending.regions.length).toBeGreaterThan(0)
    for (const region of ending.regions) {
      const system = root.querySelector(`#m3n-system-1-${region.line}`)!
      expect(Number(system.getAttribute('data-m3n-top') ?? Infinity)).toBeLessThanOrEqual(region.y)
      expect(Number(system.getAttribute('data-m3n-bottom') ?? -Infinity)).toBeGreaterThanOrEqual(region.y + region.h)
    }
    expect(root.querySelector('g.system')!.getAttribute('data-m3n-volta')).toBe('false')
  })

  it('reduces system spacing without changing notes, lyrics or event identities', () => {
    const source = '{4/4}\nN: 1~ 1 2 3 | {br} 4 5 6 7 | {br} 1e 7 6 5 | {br} 4 3 2 1 |||\nL: 春天花开山间流水清风明月故乡'
    const normal = render(source)
    const compact = render(source, { systemGap: 18, pageMargin: 8 })
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
    expect(() => render('N: 1 2 3 4 |||', { systemGap: value })).toThrow('非负有限数值')
    expect(() => render('N: 1 2 3 4 |||', { pageMargin: value })).toThrow('非负有限数值')
  })
  it('retains extended harmony symbols through the shared domain projection', () => {
    const { root, score } = render('{key=D}{4/4}\nN: 1 2 3 4 | 5 6 7 1e | 1e 7 6 5 | 4 3 2 1 |||\nC: Imaj7 | Dm7 | G/B | N.C. |')
    const labels = [...root.querySelectorAll('text')].map(text => text.textContent).join('')
    for (const symbol of ['Imaj7', 'Dm7', 'G/B', 'N.C.']) expect(labels).toContain(symbol)
    expect(score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
  })
  it.each([
    ['6/8', '(1 2 3) (4 5 6)', 8, 240],
    ['9/8', '(1 2 3) (4 5 6) (7 1e 2e)', 8, 240],
    ['12/8', '(1 2 3) (4 5 6) (7 1e 2e) (3e 2e 1e)', 8, 240],
    ['6/16', '((1 2 3)) ((4 5 6))', 16, 480],
    ['2/2', '1^ 2^', 2, 60],
    ['3/4', '1 2 3', 4, 120],
  ])('engraves %s tempo with the denominator note while retaining QPM', (meter, notes, unit, bpm) => {
    const { root, document } = render(`{${meter}}{120qpm}\nN: ${notes} |||`)
    expect(document.tempo).toBe(120)
    expect([...root.querySelectorAll('text')].some(text => text.textContent === `= ${bpm}`)).toBe(true)
    const projected = projectNumberedScore(document, options)
    expect(projected.source).toContain(`@tempo(120,size=16px,font="M3N Numbers",unit=${unit},dots=0)`)
  })
  it('uses the active denominator for mid-score tempo changes', () => {
    const { root, document } = render('{4/4}{120qpm}\nN: 1 2 3 4 | {6/8}{90qpm}(1 2 3) (4 5 6) |||')
    expect(root.body.textContent).toContain('= 180')
    expect(projectNumberedScore(document, options).source).toContain('@tempo(90,size=16px,font="M3N Numbers",unit=8,dots=0)')
  })
  it('shows an eighth-note tempo of 160 for Wo He Wo De Zu Guo without changing playback', () => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/wo_he_wo_de_zu_guo_01.m3n'), 'utf8')
    const { root, document } = render(source)
    expect(document.tempo).toBe(80)
    expect(root.body.textContent).toContain('= 160')
    expect(projectNumberedScore(document, options).source).toContain('@tempo(80,size=16px,font="M3N Numbers",unit=8,dots=0)')
  })
  it('uses the vendored engine and embedded font with stable interactive measure structure', () => {
    const { pages, root } = render('{title=测试曲} {key=D} {3/4} {90qpm}\nN: ||: 1 2 3 | 4 5 6 :|||\nL: 春天来了花开')
    expect(root.querySelector('svg')?.getAttribute('data-engine')).toBe('jpfun')
    expect(root.querySelector('g.system g.measure #m3n-e-1')).not.toBeNull()
    expect(root.querySelector('.measure')?.getAttribute('data-m3n-measure-start')).not.toBeNull()
    expect(pages[0]).toContain('data:font/ttf;base64,')
    expect(pages[0]).not.toContain('shuzi_b_bian')
    expect(root.body.textContent).toContain('测试曲')
  })

  it('anchors measure interaction bounds to the preceding bar instead of the next note', () => {
    const source = '{4/4}\nN: 1 2 3 4 | 5 6 7 1e | {br}1 2 3 4 | 5 6 7 1e |||\nB: 1d^^ | 5d^^ | 1d^^ | 5d^^ |'
    for (const width of [320, 800]) for (const paged of [false, true]) {
      const { root } = render(source, { width, paged })
      let checked = 0
      for (const system of root.querySelectorAll('g.system')) {
        const measures = [...system.querySelectorAll('g.measure')]
        expect(Number(measures[0]?.getAttribute('data-m3n-measure-start'))).toBeGreaterThanOrEqual(0)
        for (let index = 1; index < measures.length; index++) {
          const previous = measures[index - 1]!
          const bars = [...previous.querySelectorAll('rect')].filter(rect => Number(rect.getAttribute('width')) < 10 && Number(rect.getAttribute('height')) > 20)
          const barRight = Math.max(...bars.map(rect => Number(rect.getAttribute('x')) + Number(rect.getAttribute('width'))))
          expect(Number(measures[index]!.getAttribute('data-m3n-measure-start'))).toBeCloseTo(barRight, 2)
          checked++
        }
      }
      expect(checked).toBeGreaterThan(0)
    }
  })

  it('renders solely from ScoreDocument without reading its source text', () => {
    const document = parseM3NDocument('{2/4}\nN: 1 2 | 3 4 |||\nL: 春天来了')
    const before = render(document).pages
    Object.defineProperty(document, 'source', { get() { throw new Error('engraving must not read source text') } })
    expect(render(document).pages).toEqual(before)
  })

  it('shares every MEI event ID, including bass and tuplet children', () => {
    const source = '{4/4}\nN: [123:2] 4 5 | 6 7 1e 2e |||\nB: 1 2 3 4 | 5 6 7 1e |||'
    const { root, document } = render(source)
    const mei = m3nToMei(source, document)
    for (const id of scoreEventIds(document).values()) {
      expect(mei.sourceMap.some(item => item.xmlId === id)).toBe(true)
      expect(root.querySelector(`[data-m3n-id="${id}"]`)).not.toBeNull()
    }
    expect(root.querySelector('#m3n-e-1-n3')).not.toBeNull()
    const ids = [...root.querySelectorAll('[id]')].map(node => node.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('aligns both voices when the melody supplies opening and closing repeat anchors', () => {
    const document = parseM3NDocument('{6/8}\nN: ||: (1 2 3) (4 5 6) | 1e^. :||\nB: 1d 3d 5d | [1d3d5d:h]^. |||')
    const result = geometry(document)
    expect(result.lowering.duration.toNumber()).toBe(6)
    const first = result.layout.objects.filter(node => node.T.compare(0) > 0 && node.t.isZero())
    expect(first).toHaveLength(2)
    expect(first[0]!.box.x + first[0]!.box.anchor).toBeCloseTo(first[1]!.box.x + first[1]!.box.anchor)
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

  it('renders all sustained beats and retains exact very short and dotted durations', () => {
    const { root, document } = render('{4/4}\nN: 1^^^ | ((((2)))) 3. |||')
    expect(root.querySelectorAll('g.note[data-m3n-id="m3n-e-1"]')).toHaveLength(8)
    expect(root.querySelectorAll('g.note[data-m3n-id="m3n-e-1"] line')).toHaveLength(7)
    const result = geometry(document)
    const expected = [...document.parts.values()][0]!.melody.flatMap(m => m.events).reduce((sum, event) => sum + event.beats, 0)
    expect(result.lowering.duration.toNumber()).toBeCloseTo(expected)
    expect(root.querySelectorAll('circle').length).toBeGreaterThan(0)
  })

  it.each(['(1 2) 3 4 5', '(1.) ((2)) 3 4 5', '((1 2 3 4)) 5 6 7'])('preserves fractional durations in %s', notes => {
    const document = parseM3NDocument(`{4/4}\nN: ${notes} |||`)
    const expected = [...document.parts.values()][0]!.melody.flatMap(measure => measure.events).reduce((sum, event) => sum + event.beats, 0)
    expect(geometry(document).lowering.duration.toNumber()).toBeCloseTo(expected)
  })

  it.each(['fermata', 'tip', 'str', 'hold', 'brk', 'breath', 'tr', 'prall', 'f1', 'f5'])('retains the %s postfix', name => {
    const plain = render('{4/4}\nN: 1 2 3 4 |||').root.querySelector('svg')!.innerHTML
    const marked = render(`{4/4}\nN: 1{${name}} 2 3 4 |||`)
    expect(marked.root.querySelector('svg')!.innerHTML).not.toBe(plain)
    expect(marked.score.diagnostics.filter(item => item.code === 'NUMBERED_UNSUPPORTED_MARK')).toEqual([])
    for (const object of geometry(marked.document).layout.objects) {
      const box = getLayoutBounds(object)
      expect(box.w).toBeLessThan(800)
    }
  })

  it.each(['1e', '1ee', '[1e3e:h]', '1ee{ac(7e)}'])('keeps the filled staccato wedge above octave dots and below other marks on %s', pitch => {
    const source = `{2/4}\nN: {p} {dim=text} ${pitch}{tr}{f1}{tip} 2{/} |||`
    const { document, root } = render(source)
    const note = geometry(document).layout.objects.find(node => !node.T.isZero())!
    const descendants = (node: VisualTemporalNode): VisualTemporalNode[] => {
      const group = node as VisualTemporalNode & { host?: VisualTemporalNode; members?: readonly VisualTemporalNode[] }
      return [node, ...[...(group.host ? [group.host] : []), ...(group.members ?? [])].flatMap(descendants)]
    }
    const wedge = descendants(note).find(member => (member.ast as ASTFunctionNode & { definition?: { name: string } }).definition?.name === 'staccatissimo')!
    expect(wedge).toBeDefined()
    const wedgeBox = getLayoutBounds(wedge)
    const result = geometry(document)
    const outer = result.layout.attachments.filter(item => item.sourceSpan && /^@(symbol|text)\(/.test(result.maskedSource.slice(item.sourceSpan.start, item.sourceSpan.end)) && item.regions.some(r => r.line === note.layoutLine && r.x < wedgeBox.x + wedgeBox.w && r.x + r.w > wedgeBox.x))
    expect(outer.length).toBeGreaterThan(0)
    for (const item of outer) expect(item.box.y + item.box.h).toBeLessThan(wedgeBox.y)
    const circles = [...root.querySelectorAll('#m3n-e-1 circle')]
    const octaveDots = circles.filter(circle => Number(circle.getAttribute('r')) === 22 * 0.075)
    expect(octaveDots).toHaveLength(pitch === '1e' ? 1 : 2)
    expect(circles).toHaveLength(octaveDots.length + (pitch.includes('{ac') ? 1 : 0))
    expect(root.querySelector('#m3n-e-1 path[fill="#000"][stroke="none"]')).not.toBeNull()
    const octaveTop = Math.min(...octaveDots.map(circle => Number(circle.getAttribute('cy')) - Number(circle.getAttribute('r'))))
    expect(wedgeBox.y + wedgeBox.h).toBeLessThan(octaveTop)
  })

  it.each(['1', '1e', '1ee', '[1e3e:h]'])('keeps the main-note staccatissimo at the same height beside leading grace notes on %s', pitch => {
    const descendants = (node: VisualTemporalNode): VisualTemporalNode[] => {
      const compound = node as VisualTemporalNode & { host?: VisualTemporalNode; graces?: readonly VisualTemporalNode[]; members?: readonly VisualTemporalNode[] }
      return [node, ...[...(compound.host ? [compound.host] : []), ...(compound.graces ?? []), ...(compound.members ?? [])].flatMap(descendants)]
    }
    const wedgeOf = (document: ScoreDocument) => descendants(geometry(document).layout.objects.find(node => !node.T.isZero())!)
      .find(node => (node.ast as ASTFunctionNode & { definition?: { name: string } }).definition?.name === 'staccatissimo')!
    const plain = render(`{2/4}\nN: ${pitch}{tip} 2 |||`)
    const marked = render(`{2/4}\nN: ${pitch}{ac(5e6e)}{tip} 2 |||`)
    const axis = (root: Document) => Number(root.querySelector('#m3n-e-1 text[font-size="22"]')!.getAttribute('y'))
    expect(getLayoutBounds(wedgeOf(marked.document)).y - axis(marked.root))
      .toBeCloseTo(getLayoutBounds(wedgeOf(plain.document)).y - axis(plain.root), 5)
    const all = descendants(geometry(marked.document).layout.objects.find(node => !node.T.isZero())!)
    const wedge = getLayoutBounds(all.find(node => (node.ast as ASTFunctionNode & { definition?: { name: string } }).definition?.name === 'staccatissimo')!)
    const grace = all.find(node => 'graces' in node) as VisualTemporalNode & { graces: readonly VisualTemporalNode[] }
    expect(grace.graces).toHaveLength(2)
    for (const note of grace.graces) expect(getLayoutBounds(note).x + getLayoutBounds(note).w).toBeLessThan(wedge.x)
    expect(marked.score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
  })

  it('uses a filled wedge for staccato while preserving the open accent chevron', () => {
    const { root } = render('{2/4}\nN: 1e{tip} 1e{str} |||')
    const wedge = root.querySelector('#m3n-e-1 path')!
    const accent = root.querySelector('#m3n-e-2 path')!
    expect(wedge.getAttribute('fill')).toBe('#000')
    expect(wedge.getAttribute('d')).toMatch(/Z$/)
    expect(accent.getAttribute('fill')).toBe('none')
    expect(accent.getAttribute('stroke')).toBe('#000')
    expect(accent.getAttribute('d')).not.toMatch(/Z$/)
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
    expect(shifted.root.querySelector('#m3n-e-1')!.querySelectorAll('circle').length).toBeGreaterThan(base.root.querySelector('#m3n-e-1')!.querySelectorAll('circle').length)
    expect(numbers(shifted.root, 'm3n-e-1')).toBe('135')
  })

  it('anchors long chord ties to the chord instead of its final low sustain dash', () => {
    const result = geometry(parseM3NDocument('{4/4}\nN: [1d3d5d:h]^^~ | [1d3d5d:h]^^ |||'))
    const tie = result.lowering.attachments.find(attachment => 'endPoints' in attachment) as unknown as { endPoints: { ast: { callName: string } }[] }
    expect(tie.endPoints.map(node => node.ast.callName)).toEqual(['up', 'up'])
    const hairpinResult = geometry(parseM3NDocument('{4/4}\nN: {cresc}[1d3d5d:h]^^{/} |||'))
    const hairpin = hairpinResult.lowering.attachments.find(attachment => 'endPoints' in attachment) as unknown as { endPoints: VisualTemporalNode[] }
    expect(hairpin.endPoints.map(node => node.t.toNumber())).toEqual([0, 3])
  })

  it.each([
    ['two-beat notes', '{2/4}\nN: 6^~ | 6^ |||', 'note'],
    ['four-beat notes across an explicit break', '{4/4}\nN: 6^^^~ | {br}6^^^ |||', 'note'],
    ['a decorated sustained note', '{2/4}\nN: 6e^~{fermata} | 6e^ |||', 'note'],
    ['a tuplet ending in a rest', '{2/4}\nN: [660:2]~ | 6^ |||', 'note'],
  ])('anchors sustained-note ties on the pitched glyph: %s', (_name, source, kind) => {
    const document = parseM3NDocument(source)
    const events = [...document.parts.values()].flatMap(part => part.melody.flatMap(measure => measure.events))
    for (const width of [320, 800]) for (const paged of [false, true]) {
      const projection = projectNumberedScore(document, { width, paged })
      const result = geometry(document, { width, paged })
      const tie = result.lowering.attachments.find(attachment => 'endPoints' in attachment) as unknown as { endPoints: VisualTemporalNode[] }
      const start = tie.endPoints[0]!
      const ast = start.ast as ASTFunctionNode
      const event = events[0]!
      const binding = [...projection.bindings.values()].find(binding => binding.event === event && binding.slot === (event.tieFromTupletIndex ?? 0))!
      expect(ast.callName).toBe(kind)
      expect(ast.labelable?.()?.label).toBe(binding.label)
      expect(mainPitches(start).map(pitch => pitch.name)).toEqual(['6'])
    }
  })

  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('starts a multi-measure lyric tie on 6 instead of the sustain dash at width $width, paged=$paged', ({ width, paged }) => {
    const source = '{2/4}\nN: 1 2 | 6^~ | 6^ |||\nL: 甲乙白'
    const { root, document } = render(source, { width, paged })
    const event = [...document.parts.values()].flatMap(part => part.melody.flatMap(measure => measure.events))
      .find(event => event.sourceStart === source.indexOf('6^~ | 6^'))!
    const id = scoreEventIds(document).get(event)!
    expect(lyrics(root, id)).toBe('白')
    const result = geometry(document, { width, paged })
    const projection = projectNumberedScore(document, { width, paged })
    const labels = [...projection.bindings.values()].filter(binding => binding.event === event).map(binding => binding.label)
    const tie = (result.lowering.attachments as unknown as { endPoints?: VisualTemporalNode[] }[])
      .find(attachment => attachment.endPoints?.some(node => labels.includes((node.ast as ASTFunctionNode).labelable?.()?.label ?? '')))!
    const start = tie.endPoints![0]!
    const ast = start.ast as ASTFunctionNode
    expect(ast.labelable?.()?.label).toBe(labels[0])
    expect(ast.callName).toBe('note')
    expect(mainPitches(start).map(pitch => pitch.name)).toEqual(['6'])
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

  it('places boxed section names inline while directions and harmony stay above music', () => {
    const document = parseM3NDocument('{4/4}\n===训练\nN: {text=练习说明} {cresc}1{tr} 2 3 4{/} |||')
    document.parts.values().next().value!.melody[0]!.events[0]!.chord = 'Am'
    const { root } = render(document)
    const annotations = [...root.querySelectorAll('text[data-m3n-role="annotation"]')]
    expect(annotations.map(node => node.textContent)).toEqual(['Am', '练习说明'])
    expect(annotations.map(node => node.getAttribute('font-weight'))).toEqual(['normal', 'normal'])
    for (const node of annotations) expect(node.getAttribute('data-m3n-id')).toBe('m3n-e-1')
    const y = (text: string) => Number(annotations.find(node => node.textContent === text)!.getAttribute('y'))
    expect(y('练习说明')).toBeLessThan(y('Am'))
    const result = geometry(document)
    const label = result.layout.objects.find(node => 'frame' in node.ast && node.ast.frame)!
    const first = result.layout.objects.find(node => !node.T.isZero())!
    expect(label.T.isZero()).toBe(true)
    expect(label.layoutLine).toBe(first.layoutLine)
    expect(label.box.x + label.box.w).toBeLessThan(first.box.x)
    expect(label.box.y + label.box.visualAxis).toBeCloseTo(first.box.y + first.box.visualAxis)
    const direction = result.layout.attachments.at(-1)!.box
    const music = result.layout.attachments.slice(0, -2).filter(item => item.regions.length)
    expect(music.length).toBeGreaterThan(0)
    for (const item of music) expect(direction.y + direction.h).toBeLessThan(item.box.y)
  })

  it.each([320, 800])('places an explicitly separated boxed heading above its instruction without changing music or lyrics at %s', width => {
    const source = '{2/4}\n===训练{br}\nN: {text=说明} ||: 1 2 :||\nL: 甲乙\n===A\nN: 3 4 |||'
    const document = parseM3NDocument(source)
    const result = geometry(document, {width, paged:true})
    const heading = result.layout.attachments.find(item => item.sourceSpan && result.maskedSource.slice(item.sourceSpan.start,item.sourceSpan.end).startsWith('@text("训练"'))!
    const instruction = result.layout.attachments.find(item => item.sourceSpan && result.maskedSource.slice(item.sourceSpan.start,item.sourceSpan.end).includes('说明'))!
    expect(heading.box.y + heading.box.h).toBeLessThan(instruction.box.y)
    expect(heading.box.x).toBeCloseTo(32)
    const {root} = render(document, {width,paged:true})
    const label = [...root.querySelectorAll('text')].find(text => text.textContent === '训练')!
    expect(label.getAttribute('data-m3n-id')).toBe('m3n-e-1')
    expect(lyrics(root,'m3n-e-1',1)).toBe('甲')
    expect(projectNumberedScore(document, options).source).toContain('@text("A",size=14px,weight=700,frame=true)')
  })

  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('orders harmonica exercise annotations outside musical symbols at width $width, paged=$paged', settings => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n'), 'utf8')
    const document = parseM3NDocument(source)
    const result = geometry(document, settings)
    const labels = result.layout.attachments.filter(item => item.sourceSpan && result.maskedSource.slice(item.sourceSpan.start, item.sourceSpan.end).startsWith('@text('))
    expect(labels.length).toBe(30)
    const text = (item: typeof labels[number]) => result.maskedSource.slice(item.sourceSpan!.start, item.sourceSpan!.end)
    const section = labels.find(item => text(item).includes('"机能训练"'))!.box
    const instruction = labels.find(item => text(item).includes('"快速吹吸切换"'))!.box
    expect(section.y + section.h).toBeLessThan(instruction.y)
    for (const label of labels) for (const symbol of result.layout.attachments.filter(item => !labels.includes(item))) {
      const isArc = symbol.sourceSpan && result.maskedSource.slice(symbol.sourceSpan.start, symbol.sourceSpan.end).startsWith('@tie(')
      const painter = new RecordingPainter(); if (isArc) symbol.paint(painter)
      const paths = painter.commands.filter(c => c.kind === 'path')
      for (const a of label.regions) for (const [index, b] of symbol.regions.entries()) {
        if (a.line !== b.line || a.track !== b.track || a.x >= b.x + b.w || b.x >= a.x + a.w) continue
        if (!isArc) expect(a.y + a.h).toBeLessThan(b.y)
        else {
          const left = Math.max(a.x, b.x), right = Math.min(a.x + a.w, b.x + b.w)
          for (let i = 0; i <= 1000; i++) expect(a.y + a.h).toBeLessThan(nativeArcSlice(paths[index]!.commands, left + (right - left) * i / 1000)!.top)
        }
      }
    }
    const { root } = render(document, settings)
    expect(root.querySelectorAll('text[data-m3n-role="annotation"]')).toHaveLength(labels.length)
  })

  it.each([false, true])('fills every harmonica exercise system at width 1000, paged=%s', paged => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n'), 'utf8')
    const { layout } = geometry(parseM3NDocument(source), { width: 1000, paged })
    const musicLines = new Set(layout.objects.filter(node => !node.T.isZero()).map(node => node.layoutLine))
    for (const line of musicLines) {
      const nodes = layout.objects.filter(node => node.layoutLine === line)
      expect(Math.min(...nodes.map(node => node.box.x)), `system ${line} left edge`).toBeCloseTo(32)
      expect(Math.max(...nodes.map(node => node.box.x + node.box.w)), `system ${line} right edge`).toBeCloseTo(968)
    }
  })

  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('aligns harmonica tuplet brackets within each system at width $width, paged=$paged', settings => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n'), 'utf8')
    const result = geometry(parseM3NDocument(source), settings)
    const brackets = result.layout.attachments.filter(item => item.sourceSpan
      && result.maskedSource.slice(item.sourceSpan.start, item.sourceSpan.end).startsWith('@tuplet('))
    expect(brackets.length).toBeGreaterThan(20)
    const strokes = brackets.flatMap(item => {
      const painter = new RecordingPainter()
      item.paint(painter)
      return painter.commands.flatMap(command => {
        if (command.kind !== 'line' || command.y1 !== command.y2 || command.x1 === command.x2) return []
        const x = (command.x1 + command.x2) / 2
        const region = item.regions.find(region => x >= region.x && x <= region.x + region.w
          && command.y1 >= region.y && command.y1 <= region.y + region.h)
        expect(region).toBeDefined()
        return [{ line: region!.line, y: command.y1 }]
      })
    })
    expect(strokes.length).toBeGreaterThan(20)
    for (const line of new Set(strokes.map(stroke => stroke.line))) {
      const tops = strokes.filter(stroke => stroke.line === line).map(stroke => stroke.y)
      expect(Math.max(...tops) - Math.min(...tops), `system ${line} tuplet alignment`).toBeLessThan(0.01)
    }
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
    expect(root.querySelector('#m3n-e-1')?.querySelectorAll('text').length).toBe(2)
  })

  it('expands tuplets sequentially with per-note lyrics and a shared playback identity', () => {
    const { root } = render('{4/4}\nN: [123:2] 4 5 |||\nL: 春夏秋冬天')
    expect(lyrics(root, 'm3n-e-1')).toBe('春夏秋')
    expect(numbers(root, 'm3n-e-1')).toBe('123')
    expect(root.querySelectorAll('[id^="m3n-e-1-n"]')).toHaveLength(3)
  })

  it('keeps lyrics on the first tied event and skips instrumental passages', () => {
    const tied = render('{4/4}\nN: 1~ 1 2 3 |||\nL: 春天地')
    expect(lyrics(tied.root, 'm3n-e-1')).toBe('春')
    expect(lyrics(tied.root, 'm3n-e-2')).toBe('')
    expect(lyrics(tied.root, 'm3n-e-3')).toBe('天')
    const instrumental = render('{4/4}\nN: {inst}1 2{/} 3 4 |||\nL: 春天')
    expect(lyrics(instrumental.root, 'm3n-e-3')).toBe('春')
  })

  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('engraves instrumental range parentheses across systems and pages at width $width, paged=$paged', ({ width, paged }) => {
    const source = '{4/4}\nN: {inst}1d^ (2 3) 4 | ' + Array(28).fill('1 2 3 4 |').join(' ') + ' {br}[135:h]^ 0^ {/} | 5 6 7 1e |||\nL: 春天花开'
    const document = parseM3NDocument(source)
    const projection = projectNumberedScore(document, { width, paged })
    expect(projection.source.match(/@paren\(/g)).toHaveLength(1)
    const result = geometry(document, { width, paged })
    const attachment = result.layout.attachments.find(attachment => attachment.sourceSpan
      && projection.source.slice(attachment.sourceSpan.start, attachment.sourceSpan.end).startsWith('@paren('))!
    const events = [...projection.bindings.values()].filter(binding => binding.event && binding.event.sourceEnd <= document.intervals[0]!.end!)
    const labels = new Set(events.map(binding => binding.label))
    const hosts = result.layout.objects.filter(node => node.ast instanceof ASTFunctionNode && labels.has(node.ast.labelable?.()?.label ?? ''))
    const lines = [...new Set(hosts.map(node => node.layoutLine))]
    expect(lines.length).toBeGreaterThan(1)
    expect(attachment.regions).toHaveLength(lines.length * 2)
    for (const line of lines) {
      const notes = hosts.filter(node => node.layoutLine === line)
      const [left, right] = attachment.regions.filter(region => region.line === line)
      expect(left!.x + left!.w).toBeLessThan(Math.min(...notes.map(node => node.box.x)))
      expect(right!.x).toBeGreaterThan(Math.max(...notes.map(node => node.box.x + node.box.w)))
      expect(left!.x).toBeGreaterThanOrEqual(32 - 1e-6)
      expect(right!.x + right!.w).toBeLessThanOrEqual(width - 32 + 1e-6)
    }
    if (paged && width === 320) expect(result.layout.pages.length).toBeGreaterThan(1)
    const { root } = render(document, { width, paged })
    expect([...root.querySelectorAll('text[data-m3n-role="lyric"]')].map(node => node.textContent).join('')).toBe('春天花开')
  })

  it('merges nested and adjacent instrumental markings without bracketing unmarked instrumental music or merged legato', () => {
    const source = '{4/4}\nN: {inst}1 {inst}2{/inst} 3{/inst} {inst}4{/inst} | {lg}5 6{/lg} {lg}7 1e{/lg} |||'
    const document = parseM3NDocument(source)
    const projection = projectNumberedScore(document, options)
    const bindings = [...projection.bindings.values()]
    expect(projection.source.match(/@paren\(/g)).toHaveLength(1)
    expect(projection.source).toContain(`@paren(${bindings[0]!.label},${bindings[3]!.label})`)
    expect(projectNumberedScore(parseM3NDocument('N: 1 2 3 4 |'), options).source).not.toContain('@paren(')
    expect(geometry(document).diagnostics).toEqual([])
  })

  it('retains empty lyric slots and playback pass metadata across repeat verses', () => {
    const source = '{2/4}\nN: ||: 1 2 | 3 4 :|||\nL1: 春天\nL2: 花开满园'
    const { root } = render(source)
    const projection = projectNumberedScore(parseM3NDocument(source), options)
    const binding = [...projection.bindings.values()].find(binding => binding.xmlId === 'm3n-e-3')!
    expect(binding.lyrics.get(0)?.texts.join('').replaceAll('\u200B', '')).toBe('')
    expect([...binding.lyrics.get(0)!.passes!]).toContain(1)
    expect(binding.lyrics.get(1)?.texts.join('')).toBe('满')
    expect([...binding.lyrics.get(1)!.passes!]).toContain(2)
    expect(root.querySelector('text[data-m3n-id="m3n-e-3"][data-m3n-rendition="1"]')).toBeNull()
    expect(lyrics(root, 'm3n-e-3', 1)).toBe('')
    expect(lyrics(root, 'm3n-e-3', 2)).toBe('满')
    expect(root.querySelector('text[data-m3n-rendition="2"]')?.getAttribute('data-m3n-passes')).toContain('2')
  })

  it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('collapses empty chorus rows in the Internationale at width $width, paged=$paged', ({ width, paged }) => {
    const source = readFileSync(resolve(process.cwd(), '../../src/scores/the_internationale_01.m3n'), 'utf8')
    const { root } = render(source, { width, paged })
    const chorusSystems = [...root.querySelectorAll('g.system')].filter(system => {
      const rows = [...system.querySelectorAll('text[data-m3n-role="lyric"]')]
      return rows.some(node => node.getAttribute('data-m3n-rendition') === '1' && node.textContent?.replaceAll('\u200B', '').trim())
        && rows.filter(node => node.getAttribute('data-m3n-rendition') !== '1').every(node => !node.textContent?.replaceAll('\u200B', '').trim())
    })
    expect(chorusSystems.length).toBeGreaterThan(1)
    for (const system of chorusSystems) {
      const rows = [...system.querySelectorAll('text[data-m3n-role="lyric"]')]
      expect(new Set(rows.map(node => Number(node.getAttribute('y')))).size).toBe(1)
      for (const row of rows.filter(node => node.getAttribute('data-m3n-rendition') !== '1')) {
        expect(row.getAttribute('data-m3n-passes')).toBe(row.getAttribute('data-m3n-rendition'))
      }
    }
    const projection = projectNumberedScore(parseM3NDocument(source), { width, paged })
    const compact = compileScore(projection.source, { autoWrap: true, alignRelations: true })
    const original = compileScore(projection.source.replaceAll(',compactlyrics=true', ''), { autoWrap: true, alignRelations: true })
    if (!paged) expect(compact.layout.bounds.h).toBeLessThan(original.layout.bounds.h)
    else expect(compact.layout.pages.length).toBeLessThanOrEqual(original.layout.pages.length)
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

  it('attaches verse labels to the first visible syllable after skipped slots', () => {
    const { root } = render('{2/4}\nN: 1 2 :|||{x3}\nL1: %甲\nL2: (乙丙)丁\nL3: {L2}\n---\nN: 3 4 |||\nL: 戊己')
    const prefixes = [...root.querySelectorAll('text[data-m3n-role="lyric-prefix"]')]
    expect(prefixes.map(node => [node.textContent, node.getAttribute('data-m3n-id')])).toEqual([
      ['1.', 'm3n-e-2'], ['2.3.', 'm3n-e-1'],
    ])
    expect(lyrics(root, 'm3n-e-1', 2)).toBe('乙丙')
    expect(root.querySelector('text[data-m3n-role="lyric-prefix"][data-m3n-underlined]')).toBeNull()
    expect(root.querySelector('text[data-m3n-id="m3n-e-3"][data-m3n-role="lyric-prefix"]')).toBeNull()
  })

  it('carries a pending verse label across a phrase containing only skipped slots', () => {
    const { root } = render('{2/4}\nN: ||: 1 2 |\nL1: %%\nL2: 甲乙\nL3: {L2}\n---\nN: 3 4 :|||{x3}\nL1: 丙丁\nL2: 戊己\nL3: {L2}')
    const prefixes = [...root.querySelectorAll('text[data-m3n-role="lyric-prefix"]')]
    expect(prefixes.map(node => [node.textContent, node.getAttribute('data-m3n-id')])).toEqual([
      ['2.3.', 'm3n-e-1'], ['1.', 'm3n-e-3'],
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

  it.each([
    ['opening repeat', '||: {segno}1 2 :|| 3 4 {ds} |||', 0],
    ['mid-score with controls', '1 2 | {key=G}{3/4}{80qpm}{segno} 3 4 5 | 6 7 1e {ds} |||', 2],
    ['explicit break and tuplet', '1 2 | {br}{segno}[345:2] | 6 7 {ds} |||', 2],
    ['navigation written after the notes', '1 2 | 3 4 {segno} | 5 6 {ds} |||', 2],
    ['whole-measure rests', '1 2 | {segno}{rest=2} | 3 4 {ds} |||', 2],
  ])('renders the Segno destination at the measure opening: %s', (_name, music, targetBeat) => {
    const source = `{2/4}\nN: ${music}`
    const document = parseM3NDocument(source)
    for (const width of [320, 600, 800, 1000]) for (const paged of [false, true]) {
      const { layout, lowering } = geometry(document, { width, paged })
      const symbols = [...lowering.astToTemporal.values()].flat().filter(node => node.ast instanceof ASTFunctionNode
        && (node.ast as ASTFunctionNode & { definition?: { name: string } }).definition?.name === 'segno')
      expect(symbols).toHaveLength(1)
      const symbol = symbols[0]!
      expect(isVisualTemporalNode(symbol)).toBe(true)
      if (!isVisualTemporalNode(symbol)) continue
      const first = layout.objects.find(node => !node.T.isZero() && node.t.equals(targetBeat))!
      expect(symbol.t.toNumber()).toBe(targetBeat)
      expect(symbol.layoutLine).toBe(first.layoutLine)
      expect(symbol.box.y + symbol.box.visualAxis).toBeCloseTo(first.box.y + first.box.visualAxis)
      expect(symbol.box.x + symbol.box.w).toBeLessThan(first.box.x)
      expect(symbol.box.w).toBeGreaterThan(0)
      expect(symbol.box.h).toBeGreaterThan(0)
      const { root } = render(document, { width, paged })
      const plain = render(source.replace('{segno}', ''), { width, paged })
      expect(root.querySelectorAll('path').length).toBe(plain.root.querySelectorAll('path').length + 1)
    }
  })

  it.each(['fine', 'dc', 'ds'])('places %s before the closing bar on the music axis without raising its volta', name => {
    const source = `{2/4}\nN: ||: {segno}1 2 |\n---V1\nN: 3 4 {${name}} :||\n---V2\nN: 5 6 |||`
    const { layout, lowering } = geometry(parseM3NDocument(source))
    const symbol = [...lowering.astToTemporal.values()].flat().find(node => node.ast instanceof ASTFunctionNode
      && (node.ast as ASTFunctionNode & { definition?: { name: string } }).definition?.name === name)!
    expect(isVisualTemporalNode(symbol)).toBe(true)
    if (!isVisualTemporalNode(symbol)) return
    const lastNote = layout.objects.filter(node => !node.T.isZero())[3]!
    const bar = symbol.foldedInto as VisualTemporalNode
    expect(symbol.box.y + symbol.box.visualAxis).toBeCloseTo(lastNote.box.y + lastNote.box.visualAxis)
    expect(symbol.box.x).toBeGreaterThan(lastNote.box.x + lastNote.box.w)
    expect(symbol.box.x + symbol.box.w).toBeLessThan(bar.box.x + bar.box.anchor)
    const projection = projectNumberedScore(parseM3NDocument(source), options)
    const house = layout.attachments.find(attachment => attachment.sourceSpan
      && projection.source.slice(attachment.sourceSpan.start).startsWith('@volta('))!
    const plain = geometry(parseM3NDocument(source.replace(`{${name}}`, '')))
    const plainProjection = projectNumberedScore(parseM3NDocument(source.replace(`{${name}}`, '')), options)
    const plainHouse = plain.layout.attachments.find(attachment => attachment.sourceSpan
      && plainProjection.source.slice(attachment.sourceSpan.start).startsWith('@volta('))!
    const plainNote = plain.layout.objects.filter(node => !node.T.isZero())[3]!
    expect(lastNote.box.y + lastNote.box.visualAxis - house.box.y)
      .toBeCloseTo(plainNote.box.y + plainNote.box.visualAxis - plainHouse.box.y)
  })

  it.each([320, 600, 800, 1000])('keeps Second Waltz navigation inline through wrapping and pagination at width %s', width => {
    const document = parseM3NDocument(readFileSync(resolve(process.cwd(), '../../src/scores/second_waltz_01.m3n'), 'utf8'))
    for (const paged of [false, true]) {
      const { layout, lowering } = geometry(document, { width, paged })
      const symbols = [...lowering.astToTemporal.values()].flat().filter(node => node.ast instanceof ASTFunctionNode
        && ['fine', 'dc'].includes((node.ast as ASTFunctionNode & { definition?: { name: string } }).definition?.name ?? ''))
      expect(symbols).toHaveLength(2)
      for (const symbol of symbols) {
        expect(isVisualTemporalNode(symbol)).toBe(true)
        if (!isVisualTemporalNode(symbol)) continue
        const bar = symbol.foldedInto as VisualTemporalNode
        const previous = layout.objects.filter(node => node.track === bar.track && !node.T.isZero() && node.t.compare(bar.t) < 0).at(-1)!
        expect(symbol.layoutLine).toBe(previous.layoutLine)
        expect(symbol.box.y + symbol.box.visualAxis).toBeCloseTo(previous.box.y + previous.box.visualAxis)
        expect(symbol.box.x).toBeGreaterThan(previous.box.x + previous.box.w)
        expect(symbol.box.x + symbol.box.w).toBeLessThan(bar.box.x + bar.box.anchor)
        expect(bar.box.h).toBeCloseTo((bar.ast as ASTFunctionNode & { size: number }).size)
      }
    }
  })

  it.each([320, 600, 800, 1000])('clears the final D.S. below the final volta at width %s', width => {
    const document = parseM3NDocument('{2/4}\nN: ||: {segno}1 2 |\n---V1\nN: 3 4 :||\n---V2\nN: 5 6 {ds}|||')
    for (const paged of [false, true]) {
      const projection = projectNumberedScore(document, { width, paged })
      const { layout } = compileScore(projection.source, { autoWrap: true })
      const house = layout.attachments.filter(attachment => attachment.sourceSpan
        && projection.source.slice(attachment.sourceSpan.start).startsWith('@volta(')).at(-1)!
      const bar = layout.objects.at(-1)!
      expect(projection.source.slice(bar.ast.sourceSpan.start, bar.ast.sourceSpan.end)).toContain('@symbol(ds,')
      const end = house.regions.at(-1)!
      expect(end.line).toBe(bar.layoutLine)
      expect(end.y + end.h).toBeLessThan(bar.box.y)
    }
  })

  it.each([320, 800])('renders an internal opening repeat once, with its following measure at width %s', width => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 | {br} ||: 5 6 7 1e :|||\nB: 1d 2d 3d 4d | 5d 6d 7d 1 :|||')
    const result = geometry(document, { width, paged: false })
    const repeats = result.layout.objects.filter(node => (node.ast as { callName?: string; type?: number }).callName === 'bar' && (node.ast as { type?: number }).type === 3)
    expect(repeats).toHaveLength(2) // One per staff, sharing the same musical boundary.
    for (const repeat of repeats) {
      const next = result.layout.objects.find(node => node.track === repeat.track && node.t.equals(repeat.t) && !node.T.isZero())!
      expect(repeat.layoutLine).toBe(next.layoutLine)
      expect(repeat.box.x).toBeLessThan(next.box.x)
    }
  })

  it.each([320, 600, 800, 1000].flatMap(width => ['|', '||'].map(boundary => ({ width, boundary }))))('keeps opening repeats with their measure after $boundary at width $width', ({ width, boundary }) => {
    const source = '{4/4}\nN: ' + Array(4).fill('1 2 3 4 |').join(' ') + ` 5 6 7 1e ${boundary} ||: 1 2 3 4 | 5 6 7 1e :|||`
    const document = parseM3NDocument(source)
    const melody = [...document.parts.values()][0]!.melody
    const opening = melody.findIndex(measure => measure.left === 'rptstart')
    expect(melody[opening - 1]!.right).toBe(boundary === '||' ? 'dbl' : 'single')
    const time = melody.slice(0, opening).flatMap(measure => measure.events).reduce((sum, event) => sum + event.beats, 0)
    for (const paged of [false, true]) {
      const result = geometry(document, { width, paged })
      const bars = result.layout.objects.filter(node => (node.ast as { callName?: string }).callName === 'bar' && node.t.equals(time))
      const next = result.layout.objects.find(node => node.t.equals(time) && !node.T.isZero())!
      const opening = bars.filter(bar => (bar.ast as { type?: number }).type === 3)
      expect(opening).toHaveLength(1)
      expect(opening[0]!.layoutLine).toBe(next.layoutLine)
      const previous = result.layout.objects.filter(node => node.t.compare(time) < 0 && !node.T.isZero()).at(-1)!
      expect(bars).toHaveLength(previous.layoutLine === next.layoutLine ? 1 : 2)
    }
  })

  it('closes both staves before an explicit break and opens their repeats on the next system', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 || {br} ||: 5 6 7 1e :|||\nB: 1d 2d 3d 4d || 5d 6d 7d 1 :|||')
    const result = geometry(document)
    const bars = result.layout.objects.filter(node => (node.ast as { callName?: string }).callName === 'bar' && node.t.equals(4))
    expect(bars).toHaveLength(4)
    const closing = bars.filter(bar => (bar.ast as { type?: number }).type === 1)
    const opening = bars.filter(bar => (bar.ast as { type?: number }).type === 3)
    expect(closing).toHaveLength(2)
    expect(opening).toHaveLength(2)
    for (const bar of opening) {
      const next = result.layout.objects.find(node => node.track === bar.track && node.t.equals(4) && !node.T.isZero())!
      expect(bar.layoutLine).toBe(next.layoutLine)
      expect(closing.find(close => close.track === bar.track)!.layoutLine).toBe(bar.layoutLine - 1)
    }
    for (const pair of [closing, opening]) expect(pair[0]!.box.x + pair[0]!.box.anchor).toBeCloseTo(pair[1]!.box.x + pair[1]!.box.anchor)
  })

  it.each([320, 600, 800, 1000])('keeps Mario section repeats and beat groups legible at width %s', width => {
    const document = parseM3NDocument(readFileSync(resolve(process.cwd(), '../../src/scores/super_mario_01.m3n'), 'utf8'))
    const melody = [...document.parts.values()][0]!.melody
    for (const paged of [false, true]) {
      const result = geometry(document, { width, paged })
      let time = 0
      for (const measure of melody) {
        if (measure.left === 'rptstart') {
          const first = result.layout.objects.find(node => node.t.equals(time) && !node.T.isZero())!
          const repeat = result.layout.objects.find(node => node.t.equals(time) && [3, 5].includes((node.ast as { type?: number }).type ?? -1))
          expect(repeat, `missing opening repeat at beat ${time}`).toBeDefined()
          expect(repeat!.layoutLine).toBe(first.layoutLine)
        }
        time += measure.events.reduce((sum, event) => sum + event.beats, 0)
      }
      const notes = result.layout.objects.filter(node => !node.T.isZero())
      const starts = notes.filter((node, index) => index === 0 || node.layoutLine !== notes[index - 1]!.layoutLine)
      for (const start of starts) expect(start.t.denominator, `split beat at ${start.t}`).toBe(1)
      const boundaries: number[] = []
      let startTime = 0
      for (const [index, measure] of melody.entries()) {
        if (measure.left === 'rptstart' && index > 0 && !['rptend','rptboth'].includes(melody[index-1]!.right ?? '')) boundaries.push(startTime)
        startTime += measure.events.reduce((sum,event)=>sum+event.beats,0)
      }
      for (const boundary of boundaries) {
        const previous = notes.filter(node => node.t.compare(boundary) < 0).at(-1)!
        const next = notes.find(node => node.t.equals(boundary))!
        const boundaryIndex = melody.findIndex((_measure, index) => index > 0 && melody[index]!.left === 'rptstart' && melody.slice(0, index).reduce((sum, item) => sum + item.events.reduce((n, event) => n + event.beats, 0), 0) === boundary)
        const previousMeasure = melody[boundaryIndex - 1]
        const closingType = previousMeasure?.right === 'dbl' ? 1 : 0
        const closing = result.layout.objects.find(node => node.t.equals(boundary) && (node.ast as { type?: number }).type === closingType)
        if (previous.layoutLine !== next.layoutLine) expect(closing, `missing preceding bar at beat ${boundary}`).toBeDefined()
        else expect(closing).toBeUndefined()
      }
    }
  })

  it('starts a named section after a one-measure introduction on a new system', () => {
    const source = '{4/4}\n===序\nN:1 2 3 4 ||\n===主\nN:||:5 6 7 1e |1 2 3 4:|||'
    const { root } = render(source, { width: 1000 })
    const measures = [...root.querySelector('g.system')!.querySelectorAll('g.note')].map(node => node.getAttribute('data-m3n-measure'))
    expect([...new Set(measures)]).toEqual(['m3n-measure-1-1'])
    expect(root.querySelector('g.system')!.textContent).toContain('序')
    expect(root.querySelectorAll('g.system')[1]!.textContent).toContain('主')
  })

  it('forces every named section to a new system in both staves', () => {
    const source = '{4/4}\n===甲\nN: 1 2 3 4 |\nB: 1d^ 5d^ |\n===乙\nN: 5 6 7 1e |\nB: 4d^ 5d^ |\n===丙\nN: {br} 4 3 2 1 |||\nB: 5d^ 1d^ |||'
    const { layout } = geometry(parseM3NDocument(source), { width: 1000, paged: false })
    const before = layout.objects.filter(node => !node.T.isZero() && node.t.compare(8) < 0)
    const after = layout.objects.filter(node => !node.T.isZero() && node.t.compare(8) >= 0)
    expect(new Set(before.map(node => node.layoutLine)).size).toBe(2)
    expect(new Set(before.map(node => node.track)).size).toBe(2)
    expect(new Set(after.map(node => node.layoutLine)).size).toBe(1)
    expect(after[0]!.layoutLine).toBe(before[0]!.layoutLine + 2)
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
    expect(texts.map(text => text.textContent)).toEqual(expect.arrayContaining(['创作者 作词', '创作者 作曲', '演唱者 演唱']))
    expect(texts.some(text => /编曲者|作词：|作曲：|演唱：/.test(text.textContent ?? ''))).toBe(false)
    expect(() => render('{4/4}\nN: 1 2 3 4 |||', { width: NaN })).toThrow()
  })

  it('spaces header controls by 16px and keeps narrow credits above them', () => {
    const document = parseM3NDocument('{title=后来}{subtitle=测试副标题}{lyricist=施人诚}{composer=玉城千春}{arranger=长一些的编曲者署名}{singer=刘若英}{key=D}{4/4}{90qpm}\nN: 1 2 3 4 |||')
    for (const width of [320, 600, 800]) for (const paged of [false, true]) {
      const result = geometry(document, { width, paged })
      const controls = result.layout.objects.filter(node => node.ast instanceof ASTFunctionNode && ['key', 'meter', 'tempo'].includes(node.ast.callName))
      expect(controls).toHaveLength(3)
      for (let index = 1; index < controls.length; index++) {
        const before = controls[index - 1]!.box, after = controls[index]!.box
        expect(after.x - before.x - before.w).toBeCloseTo(16)
      }
      const credits = result.layout.objects.filter(node => node.ast instanceof ASTFunctionNode && 'lines' in node.ast
        && / (作词|作曲)$/.test((node.ast.lines as string[])[0]!))
      expect(credits).toHaveLength(2)
      for (const credit of credits) {
        expect(credit.box.x + credit.box.w).toBeCloseTo(width - 32)
        for (const control of controls) {
          if (control.box.x + control.box.w + 16 > credit.box.x) {
            expect(control.box.y + control.box.h <= credit.box.y + 1e-6 || control.box.y >= credit.box.y + credit.box.h - 1e-6).toBe(true)
          }
        }
      }
    }
  })

  it('uses the embedded number font for both header and in-score tempos', () => {
    const { root } = render('{96qpm} {4/4}\nN: 1 2 3 4 | {120qpm} 5 6 7 1e |||')
    const tempos = [...root.querySelectorAll('text')].filter(text => /^= (96|120)$/.test(text.textContent ?? ''))
    expect(new Set(tempos.map(text => text.textContent))).toEqual(new Set(['= 96', '= 120']))
    expect(tempos).toHaveLength(2)
    for (const tempo of tempos) expect(tempo.getAttribute('font-family')).toBe('M3N Numbers')
  })

  it.each([
    ['新不了情', '电影《新不了情》主题曲'],
    ['很长很长的主标题', '短副标题'],
    ['C大调奏鸣曲 K.545 第一乐章',''],
    ['Valsentino(快速圆舞曲)',''],
  ])('centers title and subtitle independently: %s', (title, subtitle) => {
    const source = `{title=${title}} {subtitle=${subtitle}} {singer=演唱者} {key=D} {90qpm} {4/4}\nN: 1 2 3 4 |||`
    for (const width of [320, 600, 800, 1000]) for (const paged of [false, true]) {
      const result = geometry(parseM3NDocument(source), { width, paged })
      const headings = result.layout.objects.filter(node => node.ast instanceof ASTFunctionNode
        && node.ast.callName === 'text' && 'lines' in node.ast
        && [title, subtitle].map(text=>text.replace(/\s/g,'')).includes((node.ast.lines as string[]).join('').replace(/\s/g,'')))
      expect(headings).toHaveLength(subtitle ? 2 : 1)
      for (const heading of headings) expect(Math.abs(heading.box.x + heading.box.w / 2 - width / 2)).toBeLessThan(0.05)
      if(subtitle)expect(headings[0]!.box.y + headings[0]!.box.h).toBeLessThan(headings[1]!.box.y)
      const controls = result.layout.objects.filter(node => node.ast instanceof ASTFunctionNode
        && ['key', 'meter', 'tempo'].includes(node.ast.callName))
      expect(controls).toHaveLength(3)
      // The main title stays exclusive; subtitle clearance is checked per painted line in header-sides.test.ts.
      for (const control of controls) expect(control.box.y).toBeGreaterThan(headings[0]!.box.y + headings[0]!.box.h)
    }
  })

  it('renders single-event hairpins and preserves explicit legato phrase boundaries', () => {
    const single = render('{4/4}\nN: {cresc}1{/} 2 3 4 |||')
    expect(single.score.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    expect(geometry(single.document).layout.attachments.length).toBeGreaterThan(0)
    const separate = projectNumberedScore(parseM3NDocument('{4/4}\nN: {lg}1 2{/} {lg}3 4{/} |||'), options)
    expect(separate.source.match(/@tie\([^)]*\)/g)).toEqual(['@tie(m1,m2)', '@tie(m3,m4)'])
    const nested = projectNumberedScore(parseM3NDocument('{4/4}\nN: {lg}{lg}1 2{/} {lg}3 4{/}{/} |||'), options)
    expect(nested.source.match(/@tie\([^)]*\)/g)).toEqual(['@tie(m1,m2)', '@tie(m3,m4)', '@tie(m1,m4)'])
  })

  it('places hairpins above notes and clear of nested slurs', () => {
    const source = '{4/4}\nN: {cresc}{lg}{lg}1 2{/} {lg}3 4{/}{/}{/} | {decres}{lg}{lg}5 4{/} {lg}3 2{/}{/}{/} |||'
    for (const width of [320, 820]) {
      const document = parseM3NDocument(source)
      const projection = projectNumberedScore(document, { width, paged: false })
      const result = geometry(document, { width, paged: false })
      const hairpins = result.layout.attachments.filter(item => item.sourceSpan
        && projection.source.slice(item.sourceSpan.start, item.sourceSpan.end).startsWith('@dyn('))
      expect(hairpins).toHaveLength(2)
      for (const hairpin of hairpins) for (const region of hairpin.regions) {
        const notes = result.layout.objects.filter(node => !node.T.isZero() && node.layoutLine === region.line
          && node.box.x < region.x + region.w && node.box.x + node.box.w > region.x)
        expect(notes.length).toBeGreaterThan(0)
        for (const note of notes) expect(note.box.y - region.y - region.h).toBeGreaterThan(3)
      }
    }
  })

  it('reports unsupported marks instead of silently discarding them', () => {
    const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 |||')
    document.parts.values().next().value!.melody[0]!.events[0]!.postfixes.push('unknown')
    expect(render(document).score.diagnostics.some(item => item.code === 'NUMBERED_UNSUPPORTED_MARK')).toBe(true)
  })

  it.each(corpusFiles)('preserves musical content, timing and layout for %s', file => {
      const source = readFileSync(resolve(process.cwd(), '../../src/scores', file), 'utf8')
      const document = parseM3NDocument(source)
      const score = NumberedNotationScore.create(document)
      const expectedDuration = [...document.parts.values()].reduce((sum, part) => sum + Math.max(...[part.melody, part.bass].map(measures => measures.reduce((sum, measure) => sum + (measure.multiRest ?? 0) * document.meterCount * 4 / document.meterUnit + measure.events.reduce((sum, event) => sum + event.beats, 0), 0))), 0)
      expect(geometry(document).lowering.duration.toNumber(), file).toBeCloseTo(expectedDuration)
      for (const settings of [{ width: 800, paged: false }, { width: 320, paged: true }, { width: 800, paged: false, uniformSystemHeight: true }, { width: 320, paged: true, uniformSystemHeight: true }]) {
        const projection = projectNumberedScore(document, settings)
        const result = geometry(document, settings)
        const expectedSegnos = [...document.parts.values()].flatMap(part => [...part.melody, ...part.bass])
          .filter(measure => measure.navigation?.includes('segno') || measure.events.some(event => event.navigation.includes('segno'))).length
        const segnos = result.layout.objects.filter(node => node.ast instanceof ASTFunctionNode
          && (node.ast as ASTFunctionNode & { definition?: { name: string } }).definition?.name === 'segno')
        expect(segnos, `${file}: missing Segno destination`).toHaveLength(expectedSegnos)
        const nodes = new Map<string, VisualTemporalNode>()
        for (const node of result.layout.objects) {
          const selected = node.ast instanceof ASTFunctionNode ? node.ast.labelable?.() : null
          if (selected?.label) nodes.set(selected.label, node)
          for (let ast = node.ast; ast; ast = ast.parent!) {
            if (ast instanceof ASTFunctionNode && ast.label) nodes.set(ast.label, node)
          }
          if (node.ast instanceof ASTFunctionNode && (['key', 'meter', 'tempo', 'bar'].includes(node.ast.callName) || segnos.includes(node))) {
            if (node.ast.callName === 'bar' && (node.ast as { type?: number }).type !== 3) continue
            const next = result.layout.objects.find(next => next.track === node.track && next.t.equals(node.t) && !next.T.isZero())
            if (next) expect(node.layoutLine, `${file}: orphaned ${node.ast.callName}`).toBe(next.layoutLine)
            if (next && segnos.includes(node)) {
              expect(node.box.y + node.box.visualAxis).toBeCloseTo(next.box.y + next.box.visualAxis)
              expect(node.box.x + node.box.w).toBeLessThan(next.box.x)
            }
          }
        }
        let partTime = 0
        for (const part of document.parts.values()) {
          const ends = []
          for (const staff of ['melody', 'bass'] as const) {
            let time = partTime
            for (const measure of part[staff]) {
              time += (measure.multiRest ?? 0) * document.meterCount * 4 / document.meterUnit
              for (const event of measure.events) {
                const bindings = [...projection.bindings.values()].filter(binding => binding.event === event)
                const native = bindings.map(binding => nodes.get(binding.label)!)
                expect(native.every(Boolean), `${file}: missing event at ${event.sourceStart}`).toBe(true)
                expect(native[0]!.t.toNumber(), `${file}: shifted ${staff} event`).toBeCloseTo(time)
                expect(native.reduce((sum, node) => sum + node.T.toNumber(), 0), `${file}: wrong event duration`).toBeCloseTo(event.beats)
                const inherited = bindings[0]!.sustain ? result.layout.objects.filter(node => node.track === native[0]!.track
                  && node.t.compare(native[0]!.t) < 0 && mainPitches(node).some(pitch => pitch.name !== '0')).at(-1) : undefined
                if (bindings[0]!.sustain) {
                  expect(inherited, `${file}: sustain without a pitched head`).toBeDefined()
                  expect(mainPitches(native[0]!)).toEqual([])
                }
                const pitched = event.kind === 'tuplet' ? native.flatMap(mainPitches) : mainPitches(inherited ?? native[0]!)
                expect(pitched, `${file}: changed pitches at ${event.sourceStart}`).toEqual((event.kind === 'rest' ? ['0'] : event.pitches).map(pitch => {
                  const [, name, acc = '', octaves = ''] = /^([0-7])([#b=]*)([ed]*)$/.exec(pitch)!
                  return { name, acc: name === '0' ? '' : acc.replaceAll('=', 'n'), octave: name === '0' ? 0 : [...octaves].reduce((n, c) => n + (c === 'e' ? 1 : -1), event.octaveShift) }
                }))
                time += event.beats
              }
            }
            ends.push(time)
          }
          partTime = Math.max(...ends)
        }
        const pages = score.render(settings)
        const markup = pages.join('')
        expect(pages.length, file).toBeGreaterThan(0)
        expect(markup, file).not.toMatch(/(?:NaN|Infinity)/)
        for (const id of scoreEventIds(document).values()) expect(markup, `${file}: ${id}`).toContain(`data-m3n-id="${id}"`)
        const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map(match => match[1])
        expect(new Set(ids).size, file).toBe(ids.length)
        expect(score.diagnostics.filter(item => item.code.startsWith('NUMBERED_')), file).toEqual([])
      }
  }, 30000)
})

it('prints shared lyrics once when a later visit has an alternative melody', () => {
 const {root}=render('{2/4}\nN: ||: 1 2 | 3 4 :||\nL: 甲乙 | 丙丁\nNs[2]: 2: 5 6 |')
 const text=root.body.textContent ?? ''
 expect(text).not.toContain('甲甲')
 expect(text).not.toContain('乙乙')
 expect(text).not.toContain('丙丙')
})

it('stacks different alternative passes in separate lanes', () => {
 const d=parseM3NDocument('{2/4}{order=A,A,A}\n===A\nN: 1 2 ||\nNs[2]: 1: 3 4 |\nNs[3]: 1: 5 6 |')
 const result=geometry(d)
 const notes=result.layout.objects.filter(n=>!n.T.isZero()&&n.t.isZero())
 expect(notes).toHaveLength(3)
 const ys=notes.map(n=>n.box.y).sort((a,b)=>a-b)
 expect(ys[1]!-ys[0]!).toBeGreaterThan(18)
 expect(ys[2]!-ys[1]!).toBeGreaterThan(18)
})

it('draws a tie across consecutive alternative bars', () => {
 const d=parseM3NDocument('{2/4}\nN: ||: 1 2~ | 2 3 :||\nNs[2]: 1: 4 5~ | 5 6 |')
 const p=projectNumberedScore(d,options)
 const first=d.alternatives![0]!.measure.events.at(-1)!, next=d.alternatives![1]!.measure.events[0]!
 const label=(event:typeof first)=>[...p.bindings.values()].find(b=>b.event===event)!.label
 expect(p.source).toContain(`@tie(${label(first)},${label(next)})`)
})

it('keeps a named pickup beside its phrase and closes the section with a double bar', () => {
 const d=parseM3NDocument('{2/4}{order=A,A}\n===A\nN: (5d) | 1 2 | 3. ||')
 const result=geometry(d)
 const notes=result.layout.objects.filter(n=>!n.T.isZero())
 expect(notes[0]!.layoutLine).toBe(notes[1]!.layoutLine)
 const {root}=render(d)
 expect(root.body.textContent).toContain('演奏顺序：A→A')
})

it('omits the separate second-pass heading above alternative melodies', () => {
 const d=parseM3NDocument('{2/4}\nN: ||: 1 2 :||\nNs[2]: 1: 3 4 |')
 const p=projectNumberedScore(d,options)
 expect(p.source).not.toContain('@text("2."')
 expect(p.source).toContain('@ossia(')
})

it.each([320,800].flatMap(width=>[false,true].map(paged=>({width,paged}))))('places alternatives below their own visible main lyrics at $width, paged=$paged', settings => {
 const source='{2/4}\nN: ||: 1 2 | 3 4 :||\nL1: 甲乙 | 丙丁\nL2: 戊己 | 庚辛\nNs[2]: 2: 5 6 |'
 const distance = (input: string) => {
  const {root,document}=render(input,settings), ids=scoreEventIds(document)
  const alternative=document.alternatives![0]!
  const baseline=(id:string)=>Number(root.querySelector(`g.note[data-m3n-id="${id}"] text`)!.getAttribute('y'))
  return baseline(ids.get(alternative.measure.events[0]!)!)-baseline(ids.get(alternative.host.events[0]!)!)
 }
 // A second verse in a different bar must not leave an empty verse row
 // between this bar's main lyrics and its alternative melody.
 expect(distance(source)).toBeCloseTo(distance(source.replace('L2: 戊己 |','L2: |')),4)
})

it('keeps alternative melody digits at the main melody font size', () => {
 const {root,document}=render('{2/4}\nN: ||: 1 2 :||\nNs[2]: 1: 3 4 |')
 const ids=scoreEventIds(document)
 const alternative=document.alternatives![0]!
 const size=(id:string)=>root.querySelector(`g.note[data-m3n-id="${id}"] text`)!.getAttribute('font-size')
 expect(size(ids.get(alternative.measure.events[0]!)!)).toBe('22')
 expect(size(ids.get(alternative.host.events[0]!)!)).toBe('22')
})

it('adds extra space at named boundaries while ordinary phrase breaks retain their spacing', () => {
 const prefix='{2/4}\n===A\nN: 1 2 ||\n'
 const named=projectNumberedScore(parseM3NDocument(prefix+'===B\nN: 3 4 |||'),options).source
 const ordinary=projectNumberedScore(parseM3NDocument(prefix+'---\nN: 3 4 |||'),options).source
 expect(named).toContain('@br(gap=12)')
 expect(ordinary).not.toContain('gap=12')
 const distance=(source:string)=>{
  const result=compileScore(source,{autoWrap:true})
  const notes=result.layout.objects.filter(node=>!node.T.isZero())
  return notes[2]!.box.y-notes[0]!.box.y
 }
 expect(distance(named)-distance(named.replace('@br(gap=12)','@br()'))).toBeCloseTo(12,4)
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

it('measure numbers attach once to closing melody barlines and preserve note identities', () => {
  const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 | 5 6 7 1e |||\nB: 1d - - - | 5d - - - |||')
  const plain = projectNumberedScore(document, options)
  const numbered = projectNumberedScore(document, { ...options, measureNumbers: true })
  expect(numbered.source.match(/size=10px/g)).toHaveLength(2)
  expect(numbered.source).toContain('@up({@bar(0)},@text("1",size=10px))')
  expect(numbered.source).toContain('@up({@bar(2)},@text("2",size=10px))')
  expect([...numbered.bindings.values()]).toEqual([...plain.bindings.values()])
  const result = render(document, { measureNumbers: true })
  expect(result.score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
  expect([...result.root.querySelectorAll('text[font-size="10"]')].map(node => node.textContent)).toEqual(['2'])
})


it('numbers the shared opening repeat without introducing a second barline', () => {
  const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 | ||: 5 6 7 1e :||')
  const plain = projectNumberedScore(document, options)
  const numbered = projectNumberedScore(document, { ...options, measureNumbers: true })
  expect(numbered.source).toContain('@up({@bar(3)},@text("1",size=10px))')
  expect(numbered.source.match(/@bar\(/g)?.length).toBe(plain.source.match(/@bar\(/g)?.length)
  expect(render(document, { measureNumbers: true }).score.diagnostics.filter(item => item.severity === 'error')).toEqual([])
})

it('renders a traditional tune origin without a composer label', () => {
  const { root } = render('{title=民歌}{origin=爱尔兰传统民歌}{4/4}\nN: 1 2 3 4 |||')
  const texts = [...root.querySelectorAll('text')].map(text => text.textContent)
  expect(texts).toContain('爱尔兰传统民歌')
  expect(texts).not.toContain('作曲：')
})

// Row ownership is decided after automatic wrapping and pagination.
it.each([320, 800].flatMap(width => [false, true].map(paged => ({ width, paged }))))('keeps only row-end measure numbers at $width, paged=$paged', settings => {
  const source = '{4/4}\nN: ' + Array(12).fill('1 2 3 4').join(' | ') + ' |||'
  const { root } = render(source, { ...settings, measureNumbers: true })
  const systems = [...root.querySelectorAll('g.system')].filter(system => system.querySelector('g.note'))
  expect(systems.length).toBeGreaterThan(1)
  for (const system of systems) {
    const measures = [...system.querySelectorAll('g.measure')]
    const labels = [...system.querySelectorAll('[data-m3n-role="measure-number"]')]
    expect(labels).toHaveLength(1)
    expect(labels[0]!.closest('g.measure')).toBe(measures.at(-1))
  }
})
it('identifies each top order occurrence across wrapped header rows', () => {
  const { root } = render('{4/4}{order=A,B,A,B,A,B,A,B}\n===A\nN: 0 1 2 3 |\n===B\nN: 4 5 6 7 |||', { width: 320 })
  const cells = [...root.querySelectorAll('[data-m3n-order-index]')]
  expect(cells.map(cell => cell.getAttribute('data-m3n-order-index'))).toEqual(['0', '1', '2', '3', '4', '5', '6', '7'])
  expect(cells.map(cell => cell.textContent)).toEqual(['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'])
  expect(cells.every(cell => cell.querySelector('rect') && cell.querySelector('[data-m3n-role="order"]'))).toBe(true)
})

it.each([600, 800, 1000].flatMap(width => [false, true].flatMap(paged => [false, true].map(measureNumbers => ({ width, paged, measureNumbers })))))('keeps Super Mario second-measure highlight at its opening repeat at $width, paged=$paged, numbers=$measureNumbers', settings => {
  const source = readFileSync(resolve(process.cwd(), '../../src/scores/super_mario_01.m3n'), 'utf8')
  const { root } = render(source, settings)
  const measure = root.querySelector('g.measure[data-m3n-measure-id="m3n-measure-1-2"]')!
  const opening = measure.firstElementChild!
  expect(opening.matches('g.note')).toBe(false)
  const bars = [...opening.querySelectorAll('rect')].filter(rect => Number(rect.getAttribute('height')) > 20)
  expect(bars.length).toBeGreaterThan(0)
  const barLeft = Math.min(...bars.map(rect => Number(rect.getAttribute('x'))))
  expect(Number(measure.getAttribute('data-m3n-measure-start'))).toBeCloseTo(barLeft, 2)
})

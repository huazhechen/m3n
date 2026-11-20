import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { analyzeM3N, scoreEventIds } from '@m3n/notation'
import { prepareStaffScore } from './staff-score.js'
import { scoreToMei } from './score-mei.js'
import { readXml, findAll, xml, SvgGeometry, textMeasurer, element } from './layout-svg.js'
import { splitMeasure } from './measure-fragments.js'

async function prepare(source: string, width = 720) {
  const analysis = analyzeM3N(source)
  expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  return prepareStaffScore(analysis.score, { width })
}
describe('staff layout contract', () => {
  it('respects short explicit lines, section entries and standalone section headings', async () => {
    const render = await prepare('{4/4}\n===A\nN: 1 2 3 4 | {br}5 6 7 1e |\n===B{br}\nN: 1 2 3 4 |||')
    expect(render.layoutInfo().lines.map((line) => line.measures.length)).toEqual([1, 1, 1])
    expect(render.layoutInfo().pages.flatMap((p) => p.systems)).toHaveLength(3)
    const ordinary = await prepare('{4/4}\nN: 1 2 3 4 |\n---\nN: 5 6 7 1e |||')
    expect(ordinary.layoutInfo().lines).toHaveLength(1)
  })
  it('counts real measures across multi-rests', () => {
    const mei = scoreToMei(analyzeM3N('{4/4}\nN: {rest=4} | 1 2 3 4 |||').score)
    expect([...mei.matchAll(/<measure[^>]+ n="(\d+)"/g)].map((m) => m[1])).toEqual(['1', '5'])
  })
  it('splits a dense measure at shared beats without losing original events', async () => {
    const source = '{4/4}\nN: ' + Array.from({ length: 32 }, () => '1___').join(' ') + ' |||'
    const score = analyzeM3N(source).score
    const before = structuredClone(score)
    const render = await prepareStaffScore(score, { width: 320 })
    const lines = render.layoutInfo().lines
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.flatMap(line => line.measures).every(id => id.includes('-fragment'))).toBe(true)
    expect(lines.every(line => line.minimum <= 316)).toBe(true)
    expect(score).toEqual(before)
  })
  it('retains IDs, pitches, lyrics and tuplets while splitting an oversized measure', () => {
    const score = analyzeM3N('{4/4}\nN: 1 2 3 4 |||\nL: 春夏秋冬').score
    const measure = findAll(readXml(scoreToMei(score)), (n) => n.tagName === 'measure')[0]!
    const fragments = splitMeasure(measure, 2)
    expect(fragments).toHaveLength(2)
    expect(fragments.map((f) => f.attributes.n)).toEqual(['1', '1'])
    expect(fragments[0]!.attributes.right).toBe('invis')
    expect(fragments[1]!.attributes.left).toBe('invis')
    const output = fragments.map(xml).join('')
    for (const id of scoreEventIds(score).values())
      expect(output.match(new RegExp(`xml:id="${id}"`, 'g'))).toHaveLength(1)
    expect(output).toContain('春')
    expect(output).toContain('冬')
    const tuplet = element('measure', { 'xml:id': 'm', n: '1' }, [
      element('staff', { n: '1' }, [
        element('layer', { n: '1' }, [
          element(
            'tuplet',
            { num: '3', numbase: '2' },
            Array.from({ length: 3 }, () => element('note', { dur: '8' })),
          ),
        ]),
      ]),
    ])
    expect(splitMeasure(tuplet, 0.25)).toHaveLength(1)
  })
  it('fits measured header text, supports leading, and stretches gaps within fixed pages', async () => {
    const render = await prepare(
      '{title=长标题测试长标题测试长标题测试长标题测试}{leading=0.8}{4/4}\nN: ' +
        Array.from({ length: 12 }, () => '1 2 3 4 | {br}').join(' ') +
        '1 2 3 4 |||',
      540,
    )
    const info = render.layoutInfo()
    expect(info.headerHeight).toBeGreaterThan(32)
    expect(info.spacing).toBeGreaterThanOrEqual(0.25)
    for (const page of info.pages) {
      expect(page.gap).toBeGreaterThanOrEqual(17.6)
      expect(page.gap).toBeLessThanOrEqual(32)
      for (const system of page.systems) {
        expect(system.ink.top + system.y).toBeGreaterThanOrEqual(-1e-6)
        expect(system.ink.bottom + system.y).toBeLessThanOrEqual(page.height + 1e-6)
      }
    }
    expect(render.pageCount(true)).toBe(info.pages.length)
    expect(render.pageCount(false)).toBe(1)
  })
  it('measures transformed glyph outlines and keeps empty brackets open', () => {
    const root = readXml(
      '<svg><defs><g id="glyph"><path d="M0 0 Q10 20 20 0"/></g></defs><g id="ink" transform="translate(10 30) scale(2)"><use href="#glyph"/></g></svg>',
    )
    expect(new SvgGeometry(root, textMeasurer()).ink(findAll(root, (n) => n.attributes.id === 'ink')[0]!)).toEqual({
      left: 10,
      right: 50,
      top: 30,
      bottom: 50,
    })
  })
  it('keeps continuous engraving available when the header and first system exceed A4', async () => {
    const render = await prepare(`{title=${'长标题'.repeat(200)}}{4/4}\nN: 1 2 3 4 |||`, 320)
    expect(render.layoutInfo().spacing).toBe(0.25)
    expect(render.pageCount(false)).toBe(1)
    expect(() => render.pageCount(true)).toThrow('单个五线谱谱行')
    expect(() => render(true)).toThrow('单个五线谱谱行')
  })
  it('replans final line-context widths instead of overflowing Flower Dance', async () => {
    const source = readFileSync(new URL('../../../../src/scores/flower_dance_01.m3n', import.meta.url), 'utf8')
    const render = await prepare(source, 700)
    for (const page of render.layoutInfo().pages)
      for (const system of page.systems) expect(system.ink.right).toBeLessThanOrEqual(701)
  }, 30_000)
  it('keeps custom output gaps out of the shared horizontal spacing decision', async () => {
    const score = analyzeM3N('{4/4}\nN: ' + Array.from({ length: 16 }, () => '1 2 3 4').join(' | ') + ' |||').score
    const compact = (await prepareStaffScore(score, { width: 540, coreGap: 0 })).layoutInfo()
    const open = (await prepareStaffScore(score, { width: 540, coreGap: 80 })).layoutInfo()
    expect(open.lines).toEqual(compact.lines)
    expect(open.spacing).toBe(compact.spacing)
    expect(open.pages.every((page) => page.gap === 80)).toBe(true)
  })
})

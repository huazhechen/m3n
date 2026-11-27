// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout'
import { PreparedNumberedNotationScore } from '@m3n/numbered-notation'
import { prepareStaffScore, prepareStaffMeasurementTask } from './staff-score.js'
import { planStaffLines } from './line-layout.js'
import { engraveStaffSystems } from './staff-system.js'
import { xml } from './layout-svg.js'
import { paginateStaffRows, staffRowBlock } from './staff-row-pagination.js'
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

const source = '{title=测量任务}{key=G}{4/4}\nN: 1# (2 3) 4 5 | ([6 7 1e:2]) 2e 3e 4e |||\nB: 1d 2d 3d 4d | 5d 6d 7d 1 |\nL: 春夏秋冬 | 山川天地 |'
describe('one staff measurement task', () => {
  it('keeps exact final geometry independent of cross-tier surrogate visits and split spans',async()=>{
    const score=analyzeM3N('{4/4}\nN: '+('((1 2 3 4)) ((5 6 7 1e)) ((2e 3e 4e 5e)) ((6e 7e 1ee 2ee)) | ').repeat(6)+'1^^ |||').score
    const task=await prepareStaffMeasurementTask(score)
    try {
      vi.stubGlobal('__m3nExperimentalRowReuse',true)
      vi.stubGlobal('__m3nExperimentalTierReuse',true)
      vi.stubGlobal('__m3nExperimentalInkBin',12)
      vi.stubGlobal('__m3nExperimentalWidthBin',12)
      for(const width of [360,528,720,534]) {
        const candidate=await prepareStaffScore(score,{width},undefined,task)
        expect(candidate.measurementInfo().rows).toBeGreaterThan(0)
      }
      expect(task.proxyRows.size).toBeGreaterThan(0)
      vi.stubGlobal('__m3nExperimentalRowReuse',false)
      for(const measureNumbers of [false,true]) {
        const settings={width:534,measureNumbers}
        const final=await prepareStaffScore(score,settings,undefined,task)
        const fresh=await prepareStaffScore(score,settings)
        expect(final.layoutInfo()).toEqual(fresh.layoutInfo())
        expect(final.continuousHeight()).toBe(fresh.continuousHeight())
      }
    } finally {vi.unstubAllGlobals()}
  })
  it('preserves exact numeric row geometry and SVG when collecting pagination ink eagerly', async () => {
    for (const music of [source, '{4/4}\nN: 1 2 3 4 | 5 6 7 1e |||',
      '{4/4}\nN: {cresc}1 2 3 4{/} | ([5 6 7:2]) 1e 2e 3e |||']) {
      const score = analyzeM3N(music).score, task = await prepareStaffMeasurementTask(score)
      const spacing = scoreLayoutConfig.staff.noteGapCandidates[0]!
      const lines = planStaffLines(task.document, 600, false, task.measure, spacing, task.minimum)
      const draw = (defer: boolean) => engraveStaffSystems(task.document, lines, 600, task.measure, spacing,
        false, 1, task.preparation, undefined, undefined, true, defer)
      const deferred = draw(true), eager = draw(false)
      expect(eager).toHaveLength(deferred.length)
      deferred.forEach((row, index) => {
        row.materializeInk?.()
        const next = eager[index]!
        expect({ core: next.core, ink: next.ink, pieces: next.pieces, spacing: next.spacingPieces, edges: next.edgePieces })
          .toEqual({ core: row.core, ink: row.ink, pieces: row.pieces, spacing: row.spacingPieces, edges: row.edgePieces })
        expect(xml(next.node)).toBe(xml(row.node))
      })
    }
  })
  it('preserves layouts when visiting widths and spacings in different orders', async () => {
    const score = analyzeM3N(source).score, task = await prepareStaffMeasurementTask(score)
    const original = JSON.stringify(score)
    for (const width of [720, 480, 620, 480]) {
      const settings = { width, measureNumbers: true }
      const shared = await prepareStaffScore(score, settings, undefined, task)
      const fresh = await prepareStaffScore(score, settings)
      expect(shared.layoutInfo()).toEqual(fresh.layoutInfo())
    }
    expect(JSON.stringify(score)).toBe(original)
  })
  it('reuses invariant measure bounds across widths and preserves exact layouts', async () => {
    const score = analyzeM3N(source).score, task = await prepareStaffMeasurementTask(score)
    const first = await prepareStaffScore(score, { width: 528 }, undefined, task)
    first.canBeatPageQuality(2, 0)
    const bounds = task.document.measures.map(measure => task.lowerEnvelopes.get(measure)!)
    expect(bounds.every(Boolean)).toBe(true)
    for (const width of [624, 768, 552]) {
      const next = await prepareStaffScore(score, { width }, undefined, task)
      next.canBeatPageQuality(2, 0)
      expect(next.measurementInfo()).toEqual((await prepareStaffScore(score, { width })).measurementInfo())
      for (const [index, measure] of task.document.measures.entries()) {
        const envelope = task.lowerEnvelopes.get(measure)!
        expect(envelope).toBe(bounds[index])
        expect(envelope.coreAbove).toBeGreaterThan(0)
        expect(envelope.coreBelow).toBeGreaterThan(envelope.coreAbove)
      }
    }
  })
  it('rejects sharing between scores, transpositions, tempo scales, bass settings or Chinese fonts', async () => {
    const score = analyzeM3N(source).score, settings = { transpose: 2, tempoScale: 1.5, includeBass: false }
    const task = await prepareStaffMeasurementTask(score, settings)
    await expect(prepareStaffScore(score, { ...settings, width: 480 }, undefined, task)).resolves.toBeTypeOf('function')
    for (const next of [{ ...settings, transpose: 0 }, { ...settings, tempoScale: 1 }, { ...settings, includeBass: true }, { ...settings, systemCjk: true }])
      await expect(prepareStaffScore(score, next, undefined, task)).rejects.toThrow('不能跨乐谱或排版设置复用')
    await expect(prepareStaffScore(analyzeM3N(source).score, settings, undefined, task)).rejects.toThrow('不能跨乐谱或排版设置复用')
  })
  it('honors cancellation even when task measurements already exist', async () => {
    const score = analyzeM3N(source).score, task = await prepareStaffMeasurementTask(score), controller = new AbortController()
    controller.abort()
    await expect(prepareStaffScore(score, { width: 640 }, controller.signal, task)).rejects.toThrow()
  })
})


it('allows fewer staff rows for extended sounds without copying numbered sustain slots', async () => {
  const score = analyzeM3N(`{4/4}\nN: ${'5^^ | '.repeat(16)}`).score
  const numbered = new PreparedNumberedNotationScore(score, { width: 640, pageMargin: 0 })
  const staff = await prepareStaffScore(score, { width: 640 })
  expect(staff.layoutInfo().lines.length).toBeLessThan(numbered.systemCount)
})

it('breaks rapid groups using shared pair minima without shrinking the music font', async () => {
  const music = '((5 6 5 6)) ((5 6 5 6)) ((5 6 5 6)) ((5 6 5 6)) | '.repeat(8)
  const score = analyzeM3N(`{4/4}\nN: ${music}`).score
  const size = scoreLayoutConfig.staff.music
  const staff = await prepareStaffScore(score, { width: 640 })
  expect(staff.layoutInfo().lines.map(line => line.measures.length)).toEqual([2, 2, 2, 2])
  expect(scoreLayoutConfig.staff.music).toBe(size)
})


it('preserves exact pagination when page-boundary ink contains only excluded symbols', async () => {
  const score = analyzeM3N(source).score, task = await prepareStaffMeasurementTask(score)
  for (const width of [528, 640]) for (const numbers of [false, true]) {
    const lines = planStaffLines(task.document, width, false, task.measure, .6)
    const systems = engraveStaffSystems(task.document, lines, width, task.measure, .6, numbers, 1, task.preparation)
    for (const system of systems) {
      const ordinary = new Set(system.spacingPieces)
      expect(system.boundaryPieces).toEqual(system.pieces.filter(piece => !ordinary.has(piece)))
      expect(staffRowBlock(system, 0, 40).boundaryInk!.length).toBeLessThan(system.pieces.length)
    }
    const legacy = systems.map(system => ({ ...system, boundaryPieces: undefined }))
    for (const height of [300, 900, Infinity]) for (const maximum of [40, 50]) {
      const summarize = (rows: typeof systems) => paginateStaffRows(rows, height, 50, 40, Number.isFinite(height), maximum)
        .map(page => ({ rows: page.systems.length, ys: page.ys, height: page.height, gap: page.gap }))
      expect(summarize(systems)).toEqual(summarize(legacy))
    }
  }
})

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { PreparedNumberedNotationScore, scoreLayoutConfig } from '@m3n/numbered-notation'
import { prepareStaffScore, prepareStaffMeasurementTask } from './staff-score.js'
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

const source = '{title=测量任务}{key=G}{4/4}\nN: 1# (2 3) 4 5 | ([6 7 1e:2]) 2e 3e 4e |||\nB: 1d 2d 3d 4d | 5d 6d 7d 1 |\nL: 春夏秋冬 | 山川天地 |'
describe('one staff measurement task', () => {
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

it('breaks rapid groups around natural spacing instead of packing three bars down to collision limits', async () => {
  const music = '((5 6 5 6)) ((5 6 5 6)) ((5 6 5 6)) ((5 6 5 6)) | '.repeat(8)
  const score = analyzeM3N(`{4/4}\nN: ${music}`).score
  const size = scoreLayoutConfig.staff.music
  const staff = await prepareStaffScore(score, { width: 640 })
  expect(staff.layoutInfo().lines.map(line => line.measures.length)).toEqual([2, 2, 2, 2])
  expect(scoreLayoutConfig.staff.music).toBe(size)
})

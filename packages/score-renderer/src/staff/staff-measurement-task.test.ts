// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { analyzeM3N } from '@m3n/notation'
import { PreparedNumberedNotationScore } from '@m3n/numbered-notation'
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


it.each([
  '5^^ | '.repeat(16),
  '((5 6 5 6)) ((5 6 5 6)) ((5 6 5 6)) ((5 6 5 6)) | '.repeat(8),
])('allows fewer staff rows for extended sounds and rapid groups without changing music size', async music => {
  const score = analyzeM3N(`{4/4}\nN: ${music}`).score
  const numbered = new PreparedNumberedNotationScore(score, { width: 640, pageMargin: 0 })
  const staff = await prepareStaffScore(score, { width: 640 })
  expect(staff.layoutInfo().lines.length).toBeLessThan(numbered.systemCount)
})

import { afterEach, expect, it, vi } from 'vitest'
import type { ScoreDocument } from '@m3n/notation'
import { prepareScorebookRenderer } from './scorebook-renderer'

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), task: vi.fn(), measure: vi.fn(), numberedMeasure: vi.fn(), numberedPrepare: vi.fn(), numberedPages: vi.fn() }))
vi.mock('@m3n/score-renderer/staff', () => ({ prepareStaffScore: mocks.prepare, prepareStaffMeasurementTask: mocks.task }))
vi.mock('../../tools/lib/staff-width-measurement.mjs', () => ({ measureStaffWidth: mocks.measure }))
vi.mock('../../tools/lib/numbered-width-measurement.mjs', () => ({ measureNumberedWidth: mocks.numberedMeasure }))
vi.mock('@m3n/numbered-notation', async importOriginal => ({
  ...await importOriginal<typeof import('@m3n/numbered-notation')>(),
  PreparedNumberedNotationScore: class {
    constructor(...args: unknown[]) { mocks.numberedPrepare(...args) }
    renderPaged() { return mocks.numberedPages() }
  },
}))
afterEach(() => vi.resetAllMocks())

it('keeps measurements without candidate layouts and only renders the selected width', async () => {
  const task = {}
  mocks.task.mockResolvedValue(task)
  const measured = Object.assign(vi.fn(() => { throw new Error('Measured layout must be released') }), { continuousHeight: () => 200 })
  mocks.measure.mockImplementation(async (_document, width, _settings, _signal, options) => {
    options.onPrepared(measured)
    return { width, pageCount: 1, timings: {} }
  })
  const document = {} as ScoreDocument
  const signal = new AbortController().signal
  const settings = { notationMode: 'staff' as const, measureNumbers: true }
  const renderer = await prepareScorebookRenderer(settings, signal, false)
  const first = await renderer.measure(document, 528)
  const selected = await renderer.measure(document, 624)
  expect(first.candidate.naturalHeight).toBe(200)
  expect(selected.prepared.staff).toEqual({ document, task })
  expect(mocks.task).toHaveBeenCalledOnce()
  expect(mocks.prepare).not.toHaveBeenCalled()
  const render = vi.fn(() => [{ outerHTML: '<svg />' }])
  mocks.prepare.mockResolvedValue(render)
  expect(await selected.prepared.renderPaged()).toEqual(['<svg />'])
  expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(document, { ...settings, width: 624 }, signal, task)
  expect(render).toHaveBeenCalledWith(true)
  expect(measured).not.toHaveBeenCalled()
})

it('does not rebuild a selected layout after cancellation', async () => {
  mocks.task.mockResolvedValue({})
  mocks.measure.mockImplementation(async (_document, width, _settings, _signal, options) => {
    options.onPrepared({ continuousHeight: () => 200 })
    return { width, pageCount: 1, timings: {} }
  })
  const controller = new AbortController()
  const renderer = await prepareScorebookRenderer({ notationMode: 'staff', measureNumbers: false }, controller.signal, false)
  const selected = await renderer.measure({} as ScoreDocument, 528)
  controller.abort()
  await expect(selected.prepared.renderPaged()).rejects.toMatchObject({ name: 'AbortError' })
  expect(mocks.prepare).not.toHaveBeenCalled()
})

it('releases numbered candidate layouts and rebuilds only the selected width', async () => {
  const discarded = { renderPaged() { throw new Error('Candidate must not be retained') } }
  mocks.numberedMeasure.mockImplementation((_document, width) => ({ candidate: { width, pageCount: 1, timings: {} }, prepared: discarded }))
  const controller = new AbortController()
  const renderer = await prepareScorebookRenderer({ notationMode: 'movable', measureNumbers: true }, controller.signal, false)
  const document = {} as ScoreDocument
  await renderer.measure(document, 528)
  const selected = await renderer.measure(document, 624)
  expect(mocks.numberedPrepare).not.toHaveBeenCalled()
  mocks.numberedPages.mockReturnValue(['<svg />'])
  expect(selected.prepared.renderPaged()).toEqual(['<svg />'])
  expect(mocks.numberedPrepare).toHaveBeenCalledExactlyOnceWith(document, expect.objectContaining({ width: 624, measureNumbers: true, pageMargin: 0 }))
  expect(selected.prepared.numbered).not.toBe(discarded)
  controller.abort()
  expect(() => selected.prepared.renderPaged()).toThrowError(/abort/i)
})

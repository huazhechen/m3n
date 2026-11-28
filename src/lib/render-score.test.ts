// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScoreDocument } from '@m3n/notation'
import { chooseNumberedScoreWidth, chooseStaffScoreWidth, renderScoreInto, type RenderPhase } from './render-score'

const { numberedQuality } = vi.hoisted(() => ({ numberedQuality: vi.fn() }))
const { prepareFonts, createScore } = vi.hoisted(() => ({ prepareFonts: vi.fn(), createScore: vi.fn() }))
const { staffPageCount, staffLayoutInfo, prepareStaffTask, staffTaskUses, prepareStaff } = vi.hoisted(() => ({ staffPageCount: vi.fn(), staffLayoutInfo: vi.fn(), prepareStaffTask: vi.fn(async () => ({})), staffTaskUses: vi.fn(), prepareStaff: vi.fn() }))
vi.mock('@m3n/score-renderer/staff', () => ({
  prepareStaffResources: vi.fn(),
  prepareStaffMeasurementTask: prepareStaffTask,
  prepareStaffScore: prepareStaff,
}))
vi.mock('@m3n/numbered-notation/fonts', () => ({ prepareNumberedNotationFonts: prepareFonts }))
vi.mock('@m3n/numbered-notation', () => ({ prepareNumberedNotationFonts: prepareFonts, NumberedNotationScore: { create: createScore }, NumberedTextMeasurementCache: class {}, NumberedLayoutTask: class {} }))
vi.mock('../../tools/lib/numbered-width-measurement.mjs', () => ({
  measureNumberedWidth: (document: ScoreDocument, width: number, { settings }: { settings: Record<string, unknown> }) => {
    const quality = numberedQuality(document, { ...settings, width, paged: true, pageMargin: settings.pageMargin ?? 0 })
    return { candidate: { width, ...quality, rows: 1, outside: [], overlaps: [] } }
  },
}))

vi.mock('./score-accessibility', () => ({ describeAccessibleScore: () => '' }))
vi.mock('./score-reading-dom', () => ({ attachScoreReading: vi.fn(), preserveScoreReading: () => () => {} }))

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

describe('font and layout progress', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    prepareFonts.mockReset()
    createScore.mockReset()
  })

  it('finishes fonts and gives the layout message a paint before starting synchronous work', async () => {
    const fonts = deferred()
    const layout = deferred()
    prepareFonts.mockReturnValue(fonts.promise)
    let paint: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { paint = callback; return 1 })
    const phases: RenderPhase[] = []
    const stop = new Error('stop before DOM rendering')
    createScore.mockImplementation(() => { throw stop })
    const result = renderScoreInto({} as HTMLElement, {
      scoreDocument: {} as ScoreDocument, paged: false,
      onPhase: phase => { phases.push(phase); if (phase === 'layout') layout.resolve() },
    })
    const rejected = expect(result).rejects.toBe(stop)
    await vi.waitFor(() => expect(phases.at(-1)).toBe('loading-fonts'))
    expect(createScore).not.toHaveBeenCalled()
    fonts.resolve()
    await layout.promise
    expect(phases).toEqual(['loading-library', 'loading-fonts', 'layout'])
    expect(createScore).not.toHaveBeenCalled()
    paint!(0)
    expect(createScore).not.toHaveBeenCalled()
    paint!(16)
    // requestAnimationFrame runs before paint; calculation must also wait for the next task.
    expect(createScore).not.toHaveBeenCalled()
    await rejected
    expect(createScore).toHaveBeenCalledOnce()
  })

  it('does not lay out a previous song when navigation aborts during the paint wait', async () => {
    const layout = deferred()
    const controller = new AbortController()
    let paint: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { paint = callback; return 1 })
    const result = renderScoreInto({} as HTMLElement, {
      scoreDocument: {} as ScoreDocument, paged: false, signal: controller.signal,
      onPhase: phase => { if (phase === 'layout') layout.resolve() },
    })
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await layout.promise
    controller.abort()
    paint!(0)
    expect(createScore).not.toHaveBeenCalled()
    paint!(16)
    await rejected
    expect(createScore).not.toHaveBeenCalled()
  })
})
vi.mock('../../tools/lib/staff-width-measurement.mjs', () => ({
  measureStaffWidth: async (_document: ScoreDocument, width: number, _settings: unknown, _signal: unknown, { task, candidatePolicy }: { task?: unknown; candidatePolicy?:unknown } = {}) => {
    staffTaskUses(task,candidatePolicy)
    const info = staffLayoutInfo(width)
    const densities = info.lines.map((line: { minimum: number }) => line.minimum / info.availableWidth)
    const mean = densities.reduce((a: number, b: number) => a + b, 0) / densities.length
    const lineDensityVariation = Math.sqrt(densities.reduce((sum: number, density: number) => sum + (density - mean) ** 2, 0) / densities.length) / mean
    return { width, totalCost: info.totalCost, pageCount: staffPageCount(true, width), rows: info.lines.length, outside: [], overlaps: [], lineDensityVariation,
      lastLineSlack: 1 - info.lines.at(-1).target / info.availableWidth }
  },
}))

describe('numbered automatic width margins', () => {
  it.each([undefined, 0, 32])('uses the display margin %s for every layout pass', async margin => {
    numberedQuality.mockReset()
    numberedQuality.mockImplementation((_document, { width, pageMargin }) => ({ pageCount: width >= (pageMargin === 32 ? 620 : 600) ? 2 : 3, lineDensityVariation: 0, lastLineSlack: 0 }))

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true, pageMargin: margin })

    expect(selected).toBe(margin === 32 ? 624 : 600)
    expect(numberedQuality.mock.calls.every(([, options]) => options.pageMargin === (margin ?? 0))).toBe(true)
    expect(numberedQuality.mock.calls.every(([, options]) => options.paged === true)).toBe(true)
    expect(new Set(numberedQuality.mock.calls.map(([, options]) => options.textMeasurementCache)).size).toBe(1)
    expect(new Set(numberedQuality.mock.calls.map(([, options]) => options.layoutTask)).size).toBe(1)
  })

  it('finds a better 6px break outside the best coarse width neighbourhood', async () => {
    numberedQuality.mockReset()
    // 暗香: the 696px coarse winner used to hide a better 660px break.
    numberedQuality.mockImplementation((_document, { width }) => ({ pageCount: 1,
      totalCost: width === 660 ? 2.0264406766514726 : width === 696 ? 2.2679697579457536
        : 4 + 4 * ((width - 528) / 240) ** 2 }))

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(660)
    expect(numberedQuality.mock.calls.some(([, options]) => options.width === 660)).toBe(true)
  })

  it('starts every independent selection with fresh preparation', async () => {
    numberedQuality.mockReset()
    numberedQuality.mockReturnValue({ pageCount: 1, lineDensityVariation: 0, lastLineSlack: 0 })
    const score = {} as ScoreDocument
    await chooseNumberedScoreWidth(score, { paged: true })
    const first = numberedQuality.mock.calls.map(([, options]) => options.layoutTask)
    numberedQuality.mockClear()
    await chooseNumberedScoreWidth(score, { paged: true })
    const second = numberedQuality.mock.calls.map(([, options]) => options.layoutTask)
    expect(first.every(task => task === first[0])).toBe(true)
    expect(second.every(task => task === second[0])).toBe(true)
    expect(second[0]).not.toBe(first[0])
  })

  it('keeps the automatic width at least level 1 (528px) when narrower layouts fit', async () => {
    numberedQuality.mockReset()
    numberedQuality.mockReturnValue({ pageCount: 2, lineDensityVariation: 0, lastLineSlack: 0 })

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(528)
    expect(numberedQuality.mock.calls.every(([, options]) => options.width >= 528 && options.width <= 720)).toBe(true)
  })

  it('prefers balanced three-row spacing over a short, uneven last row', async () => {
    numberedQuality.mockReset()
    numberedQuality.mockImplementation((_document, { width }) => width < 570
      ? { pageCount: 1, lineDensityVariation: 0.302, lastLineSlack: 0.424 }
      : width <= 580
        ? { pageCount: 1, lineDensityVariation: 0.125, lastLineSlack: 0 }
        : { pageCount: 1, lineDensityVariation: 0.099, lastLineSlack: 0 })

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(570)
  })

  it('never trades a page for a higher balance score', async () => {
    numberedQuality.mockReset()
    numberedQuality.mockImplementation((_document, { width }) => ({ pageCount: width < 600 ? 1 : 2, lineDensityVariation: 0, lastLineSlack: 0 }))

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(528)
  })

  it('chooses the minimum page count before comparing layout quality', async () => {
    numberedQuality.mockReset()
    numberedQuality.mockImplementation((_document, { width }) => ({ pageCount: width < 570 ? 2 : 1, lineDensityVariation: width < 570 ? 0 : 0.8, lastLineSlack: 0 }))

    const selected = await chooseNumberedScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(570)
  })
})

describe('staff automatic width range', () => {
  afterEach(() => { prepareStaffTask.mockClear(); staffTaskUses.mockClear() })
  it.each([510, 590, 640])('refines the nine levels at 6px steps when the required width is %s', async requiredWidth => {
    staffPageCount.mockReset()
    staffPageCount.mockImplementation((_paged, width) => width >= requiredWidth ? 2 : 3)
    staffLayoutInfo.mockImplementation(width => ({ pageCount: width >= requiredWidth ? 2 : 3, availableWidth: width,
      lines: [{ minimum: width * 0.6, target: width }, { minimum: width * 0.7, target: width }] }))

    const selected = await chooseStaffScoreWidth({} as ScoreDocument, { paged: true })

    expect(selected).toBe(Math.max(528, Math.ceil(requiredWidth / 6) * 6))
    expect(prepareStaffTask).toHaveBeenCalledOnce()
    const task = await prepareStaffTask.mock.results[0]!.value
    expect(staffTaskUses.mock.calls.length).toBeGreaterThan(1)
    expect(staffTaskUses.mock.lastCall![1]).toEqual({})
    expect(staffTaskUses.mock.calls.every(([used]) => used === task)).toBe(true)
    expect(staffPageCount.mock.calls.every(([paged, width]) => paged && width >= 528 && width <= 720)).toBe(true)
  })

  it('finds a staff break outside the best coarse neighbourhood on the full grid', async () => {
    staffPageCount.mockReset()
    staffPageCount.mockReturnValue(2)
    staffLayoutInfo.mockImplementation(width => ({ availableWidth: width,
      totalCost: width === 660 ? 2.1 : width === 696 ? 3.1 : 5,
      lines: [{ minimum: width * 0.6, target: width }] }))
    expect(await chooseStaffScoreWidth({} as ScoreDocument, { paged: true })).toBe(660)
    const visited=staffPageCount.mock.calls.map(([,width])=>width)
    expect(visited).toContain(660)
    expect(visited).toContain(720)
    expect(visited.filter(width => width === 660)).toHaveLength(1)
    expect(visited.every(width=>width>=528 && width<=720 && (width-528)%6===0)).toBe(true)
    expect(staffTaskUses.mock.lastCall![1]).toEqual({})
  })

  it('creates a fresh measurement task for every selection', async () => {
    staffPageCount.mockReturnValue(1)
    staffLayoutInfo.mockImplementation(width => ({ pageCount: 1, availableWidth: width,
      lines: [{ minimum: width * 0.6, target: width }] }))
    const document = {} as ScoreDocument
    await chooseStaffScoreWidth(document, { paged: true })
    const firstCount=staffTaskUses.mock.calls.length
    expect(staffTaskUses.mock.lastCall![1]).toEqual({})
    await chooseStaffScoreWidth(document, { paged: true })
    expect(prepareStaffTask).toHaveBeenCalledTimes(2)
    const first = await prepareStaffTask.mock.results[0]!.value, second = await prepareStaffTask.mock.results[1]!.value
    expect(first).not.toBe(second)
    expect(firstCount).toBe(1)
    expect(staffTaskUses.mock.calls.length).toBeGreaterThan(firstCount)
    expect(staffTaskUses.mock.calls.slice(0,firstCount).every(([task]) => task === first)).toBe(true)
    expect(staffTaskUses.mock.calls.slice(firstCount).every(([task]) => task === second)).toBe(true)
    expect(staffTaskUses.mock.lastCall![1]).toEqual({})
  })

  it('uses the same font-size and line-balance score as numbered notation', async () => {
    staffPageCount.mockReset(); staffLayoutInfo.mockReset()
    staffPageCount.mockReturnValue(1)
    staffLayoutInfo.mockImplementation(width => ({ pageCount: 1, availableWidth: width,
      lines: width < 570
        ? [{ minimum: width * 0.88, target: width }, { minimum: width * 0.69, target: width }, { minimum: width * 0.4, target: width * 0.58 }]
        : width < 590
          ? [{ minimum: width * 0.55, target: width }, { minimum: width * 0.73, target: width }, { minimum: width * 0.59, target: width }]
          : [{ minimum: width * 0.99, target: width }, { minimum: width * 0.81, target: width }],
    }))
    expect(await chooseStaffScoreWidth({} as ScoreDocument, { paged: true })).toBe(570)
  })
})


describe('first render at the selected width', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(['movable', 'staff'] as const)('mounts only the optimal-width %s score', async notationMode => {
    const host = document.createElement('div')
    const render = vi.fn((_settings: unknown) => notationMode === 'staff'
      ? [document.createElementNS('http://www.w3.org/2000/svg', 'svg')]
      : ['<svg></svg>'])
    prepareStaff.mockImplementation(async (_document, settings) => {
      expect(settings.width).toBe(600)
      return render
    })
    createScore.mockReturnValue({ render, diagnostics: [] })
    prepareFonts.mockResolvedValue(undefined)
    numberedQuality.mockImplementation((_document, { width }) => ({ pageCount: width < 600 ? 2 : 1, lineDensityVariation: 0, lastLineSlack: 0 }))
    staffPageCount.mockImplementation((_paged, width) => width < 600 ? 2 : 1)
    staffLayoutInfo.mockImplementation(width => ({ availableWidth: width, lines: [{ minimum: width * 0.6, target: width }] }))
    const paints: string[] = []
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      paints.push(host.innerHTML)
      callback()
      return 1
    })

    const result = await renderScoreInto(host, {
      scoreDocument: {} as ScoreDocument, width: 720, autoWidth: true, paged: true, notationMode,
    })

    expect(result.width).toBe(600)
    expect(host.dataset.selectedWidth).toBe('600')
    expect(host.querySelectorAll('svg')).toHaveLength(1)
    expect(paints.length).toBeGreaterThan(0)
    expect(paints.every(markup => markup === '')).toBe(true)
    expect(render).toHaveBeenCalledOnce()
    if (notationMode === 'movable') {
      expect(render.mock.calls[0][0]).toMatchObject({ width: 600 })
    }
  })

  it('cancels automatic width selection before mounting a score', async () => {
    const controller = new AbortController()
    const host = document.createElement('div')
    createScore.mockClear()
    prepareFonts.mockResolvedValue(undefined)
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      controller.abort()
      callback()
      return 1
    })
    await expect(renderScoreInto(host, {
      scoreDocument: {} as ScoreDocument, autoWidth: true, paged: true, signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(host.innerHTML).toBe('')
    expect(createScore).not.toHaveBeenCalled()
  })
})

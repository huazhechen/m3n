// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildOnlineScorebook } from './online-scorebook'

const mocks = vi.hoisted(() => ({
  load: vi.fn(), prepare: vi.fn(), prepared: vi.fn(), solo: vi.fn(), shared: vi.fn(),
  plan: { title: '测试谱集', contents: { rowsPerColumn: 28, rowHeight: 35 }, page: { width: 794, height: 1123 },
    sections: [{ id: 'basics', title: '第一章', reorderForSharing: false }],
    entries: [
      { file: 'first.m3n', title: '<第一曲>', section: 'basics', sharePage: true },
      { file: 'second.m3n', title: '第二曲', section: 'basics', sharePage: true },
    ] },
}))
vi.mock('../../scorebook/editorial-plan.json', () => ({ default: mocks.plan }))
vi.mock('./samples', () => ({
  presetScores: [{ slug: 'second', sourcePath: 'second.m3n', preferredWidth: 680 }, { slug: 'first', sourcePath: 'first.m3n', preferredWidth: 680 }],
  loadPresetScore: mocks.load,
}))
vi.mock('@m3n/numbered-notation', () => ({
  prepareNumberedNotationFonts: mocks.prepare,
  PreparedNumberedNotationScore: class {
    pageCount = 1
    title: string
    width: number
    constructor(document: { title: string }, options: { width: number }) {
      this.title = document.title; this.width = options.width
      mocks.prepared(document, options)
    }
    continuousHeight() { return 200 }
    renderPaged() { return mocks.solo(this.title, this.width) }
  },
  renderSharedPreparedNumberedNotationScores: mocks.shared,
}))
const markup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 200" data-engine="m3n"><text font-weight="700" text-anchor="middle">Title</text></svg>'
const viewBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'viewBox')
beforeAll(() => Object.defineProperty(SVGElement.prototype, 'viewBox', { configurable: true, get() {
  const [x, y, width, height] = (this.getAttribute('viewBox') ?? '').split(/\s+/).map(Number)
  return { baseVal: { x, y, width, height } }
} }))
afterAll(() => { if (viewBox) Object.defineProperty(SVGElement.prototype, 'viewBox', viewBox); else Reflect.deleteProperty(SVGElement.prototype, 'viewBox') })
function layouts() {
  mocks.load.mockImplementation(async (slug: string) => `{title=${slug}}{4/4}\nN: 1 2 3 4 |||`)
  mocks.shared.mockReturnValue({ markup: [markup, markup], scoreGap: 200 })
  mocks.solo.mockReturnValue([markup])
}
afterEach(() => { vi.resetAllMocks(); mocks.plan.entries[0].sharePage = true; document.body.replaceChildren() })

describe('online scorebook with per-run layout reuse', () => {
  it('uses only saved and shared widths, sharing complete scores with the same contents page', async () => {
    layouts()
    const result = await buildOnlineScorebook(new AbortController().signal, () => {})
    expect(mocks.prepared).toHaveBeenCalledTimes(4)
    expect(new Set(mocks.prepared.mock.calls.map(call => call[1].width))).toEqual(new Set([640, 680]))
    expect(mocks.prepared.mock.calls[0][0]).toBe(mocks.prepared.mock.calls[1][0])
    expect(mocks.shared).toHaveBeenCalledWith([expect.objectContaining({ title: 'first', width: 640 }), expect.objectContaining({ title: 'second', width: 640 })], 32)
    expect(result.scoreCount).toBe(2)
    expect(result.sharedPages).toBe(1)
    expect(result.pages).toHaveLength(3)
    expect(result.pages[1].textContent).toBe('目录第一章<第一曲>3第二曲3')
    expect(result.pages[1].querySelector('第一曲')).toBeNull()
    expect([...result.pages[2].querySelectorAll('[data-score-slug]')].map(svg => (svg as SVGSVGElement).dataset.scoreSlug)).toEqual(['first', 'second'])
    expect(result.pages[2].querySelector('a')?.getAttribute('href')).toBe('https://score.cheesefans.com/scores/first')
    const placed = result.pages[2].querySelectorAll(':scope > svg')
    expect(Number(placed[1].getAttribute('y'))).toBeCloseTo((12 + (200 + 200) * 186 / 640) * 96 / 25.4)
    expect(document.body.children).toHaveLength(0)
  })

  it('honors no-sharing anchors and keeps the saved solo width', async () => {
    layouts(); mocks.plan.entries[0].sharePage = false
    const result = await buildOnlineScorebook(new AbortController().signal, () => {})
    expect(result.sharedPages).toBe(0)
    expect(result.pages).toHaveLength(4)
    expect(mocks.shared).not.toHaveBeenCalled()
    expect(mocks.solo).toHaveBeenCalledWith('first', 680)
    expect(result.pages[1].textContent).toBe('目录第一章<第一曲>3第二曲4')
  })

  it('starts from fresh sources and layouts on every export', async () => {
    layouts()
    await buildOnlineScorebook(new AbortController().signal, () => {})
    const result = await buildOnlineScorebook(new AbortController().signal, () => {})
    expect(mocks.load).toHaveBeenCalledTimes(4)
    expect(mocks.prepared).toHaveBeenCalledTimes(8)
    expect(mocks.shared).toHaveBeenCalledTimes(2)
    expect(result.pages).toHaveLength(3)
  })

  it('aborts during layout without producing a partial book', async () => {
    layouts()
    const controller = new AbortController()
    mocks.prepared.mockImplementation(() => controller.abort())
    await expect(buildOnlineScorebook(controller.signal, () => {})).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.shared).not.toHaveBeenCalled()
    expect(mocks.solo).not.toHaveBeenCalled()
  })

  it('reports engine errors without returning an incomplete book', async () => {
    layouts()
    mocks.prepared.mockImplementation(() => { throw new Error('单个谱行高于页面') })
    await expect(buildOnlineScorebook(new AbortController().signal, () => {})).rejects.toThrow('《<第一曲>》生成失败：当前优选宽度无法完成排版，请检查谱源。')
    expect(mocks.shared).not.toHaveBeenCalled()
  })
})

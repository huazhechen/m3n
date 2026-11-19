// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildOnlineScorebook } from './online-scorebook'

const mocks = vi.hoisted(() => ({
  load: vi.fn(), prepare: vi.fn(), measure: vi.fn(), solo: vi.fn(), shared: vi.fn(),
  plan: { title: '测试谱集', page: { width: 794, height: 1123 },
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
vi.mock('../../tools/scorebook-layout.mjs', () => ({
  prepare: mocks.prepare, measure: mocks.measure, a4Pages: mocks.solo, sharedA4Page: mocks.shared,
}))
const markup = '<svg xmlns="http://www.w3.org/2000/svg" data-engine="m3n"><text font-weight="700" text-anchor="middle">Title</text></svg>'
function layouts() {
  mocks.load.mockImplementation(async (slug: string) => slug)
  mocks.measure.mockImplementation(async (_source: string, width: number) => ({ width, rows: 1, pageCount: 1, naturalHeight: 200, outside: [], overlaps: [] }))
  mocks.shared.mockResolvedValue({ markup: markup.repeat(2) })
  mocks.solo.mockResolvedValue([{ markup }])
}
afterEach(() => { vi.resetAllMocks(); mocks.plan.entries[0].sharePage = true; document.body.replaceChildren() })

describe('online scorebook with script packing', () => {
  it('uses saved widths without scanning, shares complete scores and gives both the same contents page', async () => {
    layouts()
    const result = await buildOnlineScorebook(new AbortController().signal, () => {})
    expect(mocks.measure).toHaveBeenCalledTimes(4)
    expect(new Set(mocks.measure.mock.calls.map(call => call[1]))).toEqual(new Set([640, 680]))
    expect(mocks.shared).toHaveBeenCalledWith(['first', 'second'], 640, 32, expect.any(HTMLElement))
    expect(result.scoreCount).toBe(2)
    expect(result.sharedPages).toBe(1)
    expect(result.pages).toHaveLength(3)
    expect(result.pages[1].textContent).toBe('目录第一章<第一曲>3第二曲3')
    expect(result.pages[1].querySelector('第一曲')).toBeNull()
    expect([...result.pages[2].querySelectorAll('[data-score-slug]')].map(svg => (svg as SVGSVGElement).dataset.scoreSlug)).toEqual(['first', 'second'])
    expect(result.pages[2].querySelector('a')?.getAttribute('href')).toBe('https://score.cheesefans.com/scores/first')
    expect(document.body.children).toHaveLength(0)
  })

  it('honors no-sharing anchors and keeps the saved solo width', async () => {
    layouts(); mocks.plan.entries[0].sharePage = false
    const result = await buildOnlineScorebook(new AbortController().signal, () => {})
    expect(result.sharedPages).toBe(0)
    expect(result.pages).toHaveLength(4)
    expect(mocks.shared).not.toHaveBeenCalled()
    expect(mocks.solo).toHaveBeenCalledWith('first', 680, expect.any(HTMLElement))
    expect(result.pages[1].textContent).toBe('目录第一章<第一曲>3第二曲4')
  })

  it('aborts during the candidate search and cleans up the scratch host', async () => {
    layouts()
    const controller = new AbortController()
    mocks.measure.mockImplementation(async () => { controller.abort(); return {} })
    await expect(buildOnlineScorebook(controller.signal, () => {})).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.shared).not.toHaveBeenCalled()
    expect(mocks.solo).not.toHaveBeenCalled()
    expect(document.body.children).toHaveLength(0)
  })

  it('reports the failing score and refuses unsafe partial results', async () => {
    layouts()
    mocks.measure.mockRejectedValue(new Error('超出边界'))
    await expect(buildOnlineScorebook(new AbortController().signal, () => {})).rejects.toThrow('《<第一曲>》生成失败：当前优选宽度未通过页面边界检查，请检查谱源。')
    expect(mocks.shared).not.toHaveBeenCalled()
    expect(document.body.children).toHaveLength(0)
  })
})

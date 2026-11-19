// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PresetScore } from './samples'
import { buildOnlineScorebook, orderedBookScores } from './online-scorebook'

const mocks = vi.hoisted(() => ({ load: vi.fn(), render: vi.fn() }))
vi.mock('./samples', () => ({
  presetScores: [
    { slug: 'second', title: '第二曲', category: { title: '进阶', order: 1, itemOrder: 0 } },
    { slug: 'first', title: '<第一曲>', category: { title: '基础', order: 0, itemOrder: 0 } },
  ],
  loadPresetScore: mocks.load,
}))
vi.mock('./render-score', () => ({ renderScoreInto: mocks.render }))

afterEach(() => { vi.resetAllMocks(); document.body.replaceChildren() })

describe('online scorebook', () => {
  it('keeps category training order without mutating the catalog', () => {
    const catalog = [
      { title: '未分类' },
      { title: 'B', category: { order: 0, itemOrder: 1 } },
      { title: 'A', category: { order: 0, itemOrder: 0 } },
    ] as PresetScore[]
    expect(orderedBookScores(catalog).map(score => score.title)).toEqual(['A', 'B', '未分类'])
    expect(catalog[0].title).toBe('未分类')
  })

  it('includes every score, source width, cover and exact contents page numbers', async () => {
    mocks.load.mockImplementation(async (slug: string) => `{title=${slug}}{preferred-width=680}{4/4}\nN: 1 2 3 4 |||`)
    mocks.render.mockImplementation(async (host: HTMLElement, input) => {
      expect(input.scoreDocument.preferredWidth).toBe(680)
      expect(input.width).toBeUndefined()
      expect(input.paged).toBe(true)
      host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><text font-weight="700" text-anchor="middle">Title</text></svg>'.repeat(input.scoreDocument.title === 'first' ? 2 : 1)
    })
    const progress: number[] = []
    const result = await buildOnlineScorebook(new AbortController().signal, value => progress.push(value.completed))
    expect(result.scoreCount).toBe(2)
    expect(result.pages).toHaveLength(5)
    expect(result.pages.slice(2).map(page => page.dataset.scoreSlug)).toEqual(['first', 'first', 'second'])
    const contents = result.pages[1]
    expect(contents.textContent).toBe('目录基础<第一曲>3进阶第二曲5')
    expect(contents.querySelector('第一曲')).toBeNull()
    expect(contents.querySelector('a')?.getAttribute('href')).toBe('https://score.cheesefans.com/scores/first')
    expect(result.pages[2].querySelector('a > text')?.textContent).toBe('Title')
    expect(progress).toEqual([0, 1, 1, 2])
    expect(document.body.children).toHaveLength(0)
  })

  it('aborts before engraving and cleans up the scratch host', async () => {
    const controller = new AbortController()
    mocks.load.mockImplementation(async () => { controller.abort(); return '{4/4}\nN: 1 2 3 4 |||' })
    await expect(buildOnlineScorebook(controller.signal, () => {})).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.render).not.toHaveBeenCalled()
    expect(document.body.children).toHaveLength(0)
  })

  it('reports the failing score and returns no partial book', async () => {
    mocks.load.mockRejectedValue(new Error('正文加载失败'))
    await expect(buildOnlineScorebook(new AbortController().signal, () => {})).rejects.toThrow('《<第一曲>》生成失败：正文加载失败')
    expect(document.body.children).toHaveLength(0)
  })
})

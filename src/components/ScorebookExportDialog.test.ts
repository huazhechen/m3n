// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ScorebookExportDialog } from './ScorebookExportDialog'
import { buildVersion } from '../lib/build-version'
import type { ScorebookProgress } from '../lib/online-scorebook'

const mocks = vi.hoisted(() => ({ build: vi.fn(), pdf: vi.fn(), download: vi.fn(), preload: vi.fn(async () => {}) }))
vi.mock('../lib/online-scorebook', () => ({ buildOnlineScorebook: mocks.build, scorebookTitle: '测试谱集' }))
vi.mock('@m3n/score-renderer/view', () => ({
  preloadScorePdf: mocks.preload, createScorePdf: mocks.pdf, downloadBlob: mocks.download, scoreFileName: (value: string) => value,
}))
const host = document.createElement('div')
let root: ReturnType<typeof createRoot>
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals() })

it.each([['staff', '简谱', 'movable'], ['fixed', '五线谱', 'staff']] as const)('uses the export choice independently of saved %s notation and shows progress', async (savedMode, choice, mode) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'm3n:notation-mode' ? savedMode : key === 'm3n:measure-numbers' ? '1' : null })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn() })
  let report!: (value: ScorebookProgress) => void
  // Slow PDF code must not keep a ready library waiting to start layout.
  mocks.preload.mockImplementation(() => new Promise(() => {}))
  mocks.build.mockImplementation((_signal, onProgress) => {
    report = onProgress
    return new Promise(() => {})
  })
  document.body.append(host); root = createRoot(host)
  await act(async () => {
    root.render(createElement(ScorebookExportDialog, { onClose: vi.fn() }))
    await new Promise(resolve => setTimeout(resolve, 80))
  })
  expect(mocks.build).not.toHaveBeenCalled()
  expect(mocks.preload).not.toHaveBeenCalled()
  expect(mocks.pdf).not.toHaveBeenCalled()
  expect(document.querySelector('progress')).toBeNull()
  act(() => [...document.querySelectorAll('button')].find(button => button.textContent === choice)!.click())
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)) })
  expect(mocks.build).toHaveBeenCalledWith(expect.any(AbortSignal), expect.any(Function), { notationMode: mode, measureNumbers: true })
  expect(document.body.textContent).toContain(`记谱方式：${choice}`)
  expect(document.body.textContent).toContain('正在加载排版模块')
  expect(document.body.textContent).not.toContain('正在下载乐谱与字体')
  act(() => report({ phase: 'downloading', completed: 100, total: 100, title: '' }))
  expect(document.body.textContent).toContain('第 2/3 阶段：排版乐谱')
  expect(document.body.textContent).not.toContain('正在下载乐谱与字体')
  act(() => report({ phase: 'downloading', completed: 50, total: 100, title: '' }))
  expect(document.body.textContent).toContain('第 1/3 阶段：下载乐谱与字体')
  expect(document.body.textContent).toContain('正在下载乐谱与字体 50%')
  expect(document.querySelector('progress')?.value).toBe(50)
  expect(document.querySelector('progress')?.max).toBe(100)
  act(() => report({ phase: 'downloading', completed: 100, total: 100, title: '', indeterminate: true }))
  expect(document.body.textContent).toContain('正在安装字体')
  expect(document.querySelector('progress')?.hasAttribute('value')).toBe(false)
  act(() => report({ phase: 'preparing', completed: 0, total: 107, title: '第一曲' }))
  expect(document.body.textContent).toContain('第 2/3 阶段：排版乐谱')
  expect(document.querySelector('progress')?.value).toBe(0)
  act(() => report({ phase: 'measuring', completed: 0, total: 107, title: '第一曲' }))
  expect(document.body.textContent).toContain('正在计算排版 0 / 107 首')
  expect(document.querySelector('progress')?.value).toBe(107)
  expect(document.querySelector('progress')?.max).toBe(321)
})

it('finishes PDF generation before enabling a synchronous download', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn() })
  const pages = Array.from({ length: 2 }, () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.innerHTML = '<text>Page</text>'
    return svg
  })
  mocks.build.mockResolvedValue({ pages, scoreCount: 102, sharedPages: 2 })
  let finishPdf!: (blob: Blob) => void
  let reportPage!: (done: number, total: number) => void
  mocks.pdf.mockImplementation((_pages, progress) => { reportPage = progress; return new Promise<Blob>(resolve => { finishPdf = resolve }) })
  document.body.append(host); root = createRoot(host)
  await act(async () => {
    root.render(createElement(ScorebookExportDialog, { onClose: vi.fn() }))
    await new Promise(resolve => setTimeout(resolve, 80))
  })
  act(() => [...document.querySelectorAll('button')].find(button => button.textContent === '简谱')!.click())
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)) })
  expect(mocks.pdf).toHaveBeenCalledOnce()
  expect(document.body.textContent).toContain('第 3/3 阶段：生成 PDF')
  expect(document.body.textContent).not.toContain('下载 PDF')
  act(() => reportPage(1, 2))
  expect(pages[0].childElementCount).toBe(0)
  expect(pages[1].querySelector('text')?.textContent).toBe('Page')
  act(() => reportPage(2, 2))
  expect(pages[1].childElementCount).toBe(0)
  const blob = new Blob(['PDF'])
  await act(async () => finishPdf(blob))
  const download = [...document.querySelectorAll('button')].find(button => button.textContent === '下载 PDF')!
  expect(download).toBeDefined()
  act(() => download.click())
  expect(mocks.download).toHaveBeenCalledWith(blob, `测试谱集-${buildVersion}.pdf`)
  expect(mocks.pdf).toHaveBeenCalledOnce()
  expect(mocks.build).toHaveBeenCalledOnce()
})

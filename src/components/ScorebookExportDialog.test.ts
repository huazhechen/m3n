// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ScorebookExportDialog } from './ScorebookExportDialog'
import type { ScorebookProgress } from '../lib/online-scorebook'

const mocks = vi.hoisted(() => ({ build: vi.fn(), pdf: vi.fn(), download: vi.fn() }))
vi.mock('../lib/online-scorebook', () => ({ buildOnlineScorebook: mocks.build, scorebookTitle: '测试谱集' }))
vi.mock('@m3n/score-renderer/view', () => ({
  preloadScorePdf: async () => {}, createScorePdf: mocks.pdf, downloadBlob: mocks.download, scoreFileName: (value: string) => value,
}))
const host = document.createElement('div')
let root: ReturnType<typeof createRoot>
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals() })

it('shows advancing font preparation separately from layout progress', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'm3n:notation-mode' ? 'staff' : key === 'm3n:measure-numbers' ? '1' : null })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn() })
  let report!: (value: ScorebookProgress) => void
  mocks.build.mockImplementation((_signal, onProgress) => {
    report = onProgress
    return new Promise(() => {})
  })
  document.body.append(host); root = createRoot(host)
  await act(async () => {
    root.render(createElement(ScorebookExportDialog, { onClose: vi.fn() }))
    await new Promise(resolve => setTimeout(resolve, 80))
  })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)) })
  expect(mocks.build).toHaveBeenCalledWith(expect.any(AbortSignal), expect.any(Function), { notationMode: 'staff', measureNumbers: true })
  expect(document.body.textContent).toContain('采用当前五线谱设置')
  act(() => report({ phase: 'preparing', completed: 0, total: 107, title: '第一曲' }))
  expect(document.body.textContent).toContain('正在准备乐谱与字体 0 / 107 首')
  act(() => report({ phase: 'preparing', completed: 1, total: 107, title: '第一曲' }))
  expect(document.body.textContent).toContain('正在准备乐谱与字体 1 / 107 首')
  expect(document.querySelector('progress')?.value).toBe(1)
  expect(document.querySelector('progress')?.max).toBe(107)
  act(() => report({ phase: 'measuring', completed: 0, total: 107, title: '第一曲' }))
  expect(document.body.textContent).toContain('正在计算排版 0 / 107 首')
  expect(document.querySelector('progress')?.value).toBe(0)
})

it('finishes PDF generation before enabling a synchronous download', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn() })
  const pages = [document.createElementNS('http://www.w3.org/2000/svg', 'svg')]
  mocks.build.mockResolvedValue({ pages, scoreCount: 102, sharedPages: 2 })
  let finishPdf!: (blob: Blob) => void
  mocks.pdf.mockImplementation(() => new Promise<Blob>(resolve => { finishPdf = resolve }))
  document.body.append(host); root = createRoot(host)
  await act(async () => {
    root.render(createElement(ScorebookExportDialog, { onClose: vi.fn() }))
    await new Promise(resolve => setTimeout(resolve, 80))
  })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)) })
  expect(mocks.pdf).toHaveBeenCalledOnce()
  expect(document.body.textContent).not.toContain('下载 PDF')
  const blob = new Blob(['PDF'])
  await act(async () => finishPdf(blob))
  const download = [...document.querySelectorAll('button')].find(button => button.textContent === '下载 PDF')!
  expect(download).toBeDefined()
  act(() => download.click())
  expect(mocks.download).toHaveBeenCalledWith(blob, '测试谱集.pdf')
  expect(mocks.pdf).toHaveBeenCalledOnce()
  expect(mocks.build).toHaveBeenCalledOnce()
})

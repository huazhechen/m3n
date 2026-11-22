// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ScorebookExportDialog } from './ScorebookExportDialog'

const mocks = vi.hoisted(() => ({ build: vi.fn(), pdf: vi.fn(), download: vi.fn() }))
vi.mock('../lib/online-scorebook', () => ({ buildOnlineScorebook: mocks.build, scorebookTitle: '测试谱集' }))
vi.mock('@m3n/score-renderer/view', () => ({
  preloadScorePdf: async () => {}, createScorePdf: mocks.pdf, downloadBlob: mocks.download, scoreFileName: (value: string) => value,
}))
const host = document.createElement('div')
let root: ReturnType<typeof createRoot>
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.resetAllMocks() })

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

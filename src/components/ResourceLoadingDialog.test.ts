// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ResourceLoadingDialog, ResourceLoadingHost } from './ResourceLoadingDialog'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})
function render(title: string, loading = true, active = true) {
  act(() => root.render(createElement('div', null,
    createElement(ResourceLoadingHost),
    createElement(ResourceLoadingDialog, { title, loading, active, description: '准备资源', progressLabel: '资源进度' }))))
}
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

it('does not interrupt cache hits or ordinary layout, and retains an opened dialog through layout', () => {
  render('字体')
  tick(100)
  render('排版', false)
  tick(500)
  expect(document.querySelector('dialog[open]')).toBeNull()
  render('字体')
  tick(350)
  expect(document.querySelector('dialog[open]')).not.toBeNull()
  render('排版', false)
  expect(document.querySelector('dialog[open] h2')?.textContent).toBe('排版')
  render('结束', false, false)
  tick(150)
  expect(document.querySelector('dialog')).toBeNull()
})

it('shares one modal across source/render handoffs and keeps background dismissal until completion', () => {
  render('谱源')
  tick(350)
  const dialog = document.querySelector('dialog')!
  render('谱源', false, false)
  tick(50)
  render('渲染资源')
  expect(document.querySelector('dialog')).toBe(dialog)
  act(() => (dialog.querySelector('button') as HTMLButtonElement).click())
  render('字体资源')
  tick(500)
  expect(document.querySelector('dialog')).toBeNull()
  render('完成', false, false)
  tick(150)
  render('下一次下载')
  tick(350)
  expect(document.querySelector('dialog[open] h2')?.textContent).toBe('下一次下载')
})

// @vitest-environment jsdom
import '../../tools/test-dialog-setup'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ResourceLoadingDialog, ResourceLoadingHost } from './ResourceLoadingDialog'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
function render(title: string, loading = true, active = true, delayMs?: number) {
  act(() => root.render(createElement('div', null,
    createElement(ResourceLoadingHost),
    createElement(ResourceLoadingDialog, { title, loading, active, delayMs, description: '准备资源', progressLabel: '资源进度' }))))
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

it('shows layout and notation switching immediately and keeps the same dialog until finished', () => {
  render('正在排版乐谱', true, true, 0)
  tick(0)
  const dialog = document.querySelector('dialog[open]')!
  expect(dialog).not.toBeNull()
  render('准备五线谱', true, true, 0)
  expect(document.querySelector('dialog[open]')).toBe(dialog)
  render('正在排版乐谱', true, true, 0)
  expect(document.querySelector('dialog[open]')).toBe(dialog)
  render('完成', false, false, 0)
  tick(150)
  expect(document.querySelector('dialog')).toBeNull()
  render('准备简谱', true, true, 0)
  tick(0)
  expect(document.querySelector('dialog[open] h2')?.textContent).toBe('准备简谱')
})

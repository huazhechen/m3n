// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { attachScoreKeyboard } from './score-reader-keyboard'

let root: HTMLElement, navigate: ReturnType<typeof vi.fn<(direction: 'previous' | 'next') => void>>, destroy: () => void
beforeEach(() => {
  root = document.createElement('main')
  root.innerHTML = '<div class="score-paper"></div><input type="range"><div contenteditable="true"></div><button>settings</button>'
  document.body.append(root)
  navigate = vi.fn()
  destroy = attachScoreKeyboard(root, navigate)
})
afterEach(() => { destroy(); document.body.replaceChildren() })
function press(key: string, target: Element = document.body, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
  target.dispatchEvent(event)
  return event
}
it('switches songs with plain left and right arrows and removes its listener', () => {
  expect(press('ArrowLeft').defaultPrevented).toBe(true)
  expect(press('ArrowRight', root.querySelector('.score-paper')!).defaultPrevented).toBe(true)
  expect(navigate.mock.calls).toEqual([['previous'], ['next']])
  destroy()
  press('ArrowRight')
  expect(navigate).toHaveBeenCalledTimes(2)
})
it('preserves controls, unrelated keys and modified, repeated or composing keys', () => {
  for (const target of root.querySelectorAll('input, button, [contenteditable]')) expect(press('ArrowRight', target).defaultPrevented).toBe(false)
  for (const options of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }, { repeat: true }, { isComposing: true }]) press('ArrowLeft', document.body, options)
  press('ArrowDown')
  const link = document.createElement('a')
  document.body.append(link)
  press('ArrowRight', link)
  expect(navigate).not.toHaveBeenCalled()
})
it('does not switch through an open dialog or an already consumed key', () => {
  document.body.addEventListener('keydown', event => event.preventDefault(), { once: true })
  press('ArrowRight')
  const dialog = document.createElement('dialog')
  dialog.open = true
  document.body.append(dialog)
  press('ArrowLeft')
  expect(navigate).not.toHaveBeenCalled()
})
it('leaves arrows available for zoomed and horizontally overflowing scores', () => {
  const paper = root.querySelector<HTMLElement>('.score-paper')!
  paper.dataset.zoomed = 'true'
  expect(press('ArrowRight').defaultPrevented).toBe(false)
  delete paper.dataset.zoomed
  Object.defineProperties(paper, { scrollWidth: { value: 900 }, clientWidth: { value: 700 } })
  expect(press('ArrowLeft').defaultPrevented).toBe(false)
  expect(navigate).not.toHaveBeenCalled()
})

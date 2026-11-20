// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ScoreWidthControl } from './ScoreWidthControl'

let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function render(width = 540, onChange = vi.fn(), onReset = vi.fn()) {
  act(() => root.render(createElement(ScoreWidthControl, { width, onChange, onReset })))
  const slider = host.querySelector('input')!
  slider.setPointerCapture = vi.fn()
  return { slider, onChange, onReset }
}
function input(slider: HTMLInputElement, value: number) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, String(value))
    slider.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function pointer(slider: HTMLInputElement, type: string) {
  act(() => slider.dispatchEvent(new Event(type, { bubbles: true })))
}

it('shows each drag value immediately, throttles previews, and commits the final value on release', () => {
  const { slider, onChange } = render()
  pointer(slider, 'pointerdown')
  for (const width of [550, 580, 610]) input(slider, width)
  expect(host.querySelector('output')!.textContent).toBe('610px')
  expect(onChange).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(150))
  expect(onChange.mock.calls).toEqual([[610]])
  render(610, onChange)
  input(slider, 650)
  pointer(slider, 'pointerup')
  expect(onChange.mock.calls).toEqual([[610], [650]])
  act(() => vi.runAllTimers())
  expect(onChange).toHaveBeenCalledTimes(2)
})

it.each(['pointercancel', 'lostpointercapture', 'focusout'])('flushes the last width on %s', event => {
  const { slider, onChange } = render()
  pointer(slider, 'pointerdown')
  input(slider, 700)
  pointer(slider, event)
  expect(onChange.mock.calls).toEqual([[700]])
  act(() => vi.runAllTimers())
  expect(onChange).toHaveBeenCalledTimes(1)
})

it('applies keyboard changes immediately and discards scheduled work on unmount', () => {
  const { slider, onChange } = render()
  input(slider, 550)
  expect(onChange.mock.calls).toEqual([[550]])
  pointer(slider, 'pointerdown')
  input(slider, 800)
  act(() => root.render(null))
  act(() => vi.runAllTimers())
  expect(onChange.mock.calls).toEqual([[550]])
})

it('steps from an off-grid width in both directions and disables buttons at the limits', () => {
  const { onChange } = render(555)
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="减小乐谱宽度"]')!.click())
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="增大乐谱宽度"]')!.click())
  expect(onChange.mock.calls).toEqual([[550], [560]])
  render(320)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="减小乐谱宽度"]')!.disabled).toBe(true)
  render(1280)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="增大乐谱宽度"]')!.disabled).toBe(true)
})

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

function render(width = 480, onChange = vi.fn(), onReset = vi.fn()) {
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
  for (const level of [21, 22, 23]) input(slider, level)
  expect(host.querySelector('output')!.textContent).toBe('552px')
  expect(onChange).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(150))
  expect(onChange.mock.calls).toEqual([[552]])
  render(552, onChange)
  input(slider, 25)
  pointer(slider, 'pointerup')
  expect(onChange.mock.calls).toEqual([[552], [600]])
  act(() => vi.runAllTimers())
  expect(onChange).toHaveBeenCalledTimes(2)
})

it.each(['pointercancel', 'lostpointercapture', 'focusout'])('flushes the last width on %s', event => {
  const { slider, onChange } = render()
  pointer(slider, 'pointerdown')
  input(slider, 30)
  pointer(slider, event)
  expect(onChange.mock.calls).toEqual([[720]])
  act(() => vi.runAllTimers())
  expect(onChange).toHaveBeenCalledTimes(1)
})

it('applies keyboard changes immediately and discards scheduled work on unmount', () => {
  const { slider, onChange } = render()
  input(slider, 21)
  expect(onChange.mock.calls).toEqual([[504]])
  pointer(slider, 'pointerdown')
  input(slider, 40)
  act(() => root.render(null))
  act(() => vi.runAllTimers())
  expect(onChange.mock.calls).toEqual([[504]])
})

it('steps from an off-grid width in both directions and disables buttons at the limits', () => {
  const { onChange } = render(610)
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="减小乐谱宽度"]')!.click())
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="增大乐谱宽度"]')!.click())
  expect(onChange.mock.calls).toEqual([[606], [612]])
  render(480)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="减小乐谱宽度"]')!.disabled).toBe(true)
  render(960)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="增大乐谱宽度"]')!.disabled).toBe(true)
})

it('exposes the manual 20–40 multiple range independently from the search levels', () => {
  const { slider } = render(720)
  expect([slider.min, slider.max, slider.step, slider.value]).toEqual(['20', '40', '0.25', '30'])
  expect(slider.getAttribute('aria-valuetext')).toBe('720px')
  expect(host.querySelector('output')!.textContent).toBe('720px')
})

it('drags and uses keyboard steps at 6px granularity', () => {
  const { slider, onChange } = render(600)
  input(slider, 25.25)
  expect(onChange.mock.calls).toEqual([[606]])
  pointer(slider, 'pointerdown')
  input(slider, 25.5)
  expect(host.querySelector('output')!.textContent).toBe('612px')
  pointer(slider, 'pointerup')
  expect(onChange.mock.calls).toEqual([[606], [612]])
})

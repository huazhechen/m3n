// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlaybackSpeedControl } from './PlaybackSpeedControl'

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

function render(bpm = 120, onChange = vi.fn(), onReset = vi.fn()) {
  act(() => root.render(createElement(PlaybackSpeedControl, { bpm, onChange, onReset })))
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

it('shows drag values immediately, defers score updates until release, and commits the final value', () => {
  const { slider, onChange } = render()
  pointer(slider, 'pointerdown')
  for (const bpm of [121, 126, 133]) input(slider, bpm)
  expect(host.querySelector('output')!.textContent).toBe('133 BPM')
  expect(onChange).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(5000))
  expect(onChange).not.toHaveBeenCalled()
  render(120, onChange)
  expect(slider.value).toBe('133')
  input(slider, 137)
  pointer(slider, 'pointerup')
  expect(onChange.mock.calls).toEqual([[137]])
  act(() => vi.runAllTimers())
  expect(onChange).toHaveBeenCalledTimes(1)
})

it.each(['pointercancel', 'lostpointercapture', 'focusout'])('commits the last speed exactly once on %s', event => {
  const { slider, onChange } = render()
  pointer(slider, 'pointerdown')
  input(slider, 137)
  pointer(slider, event)
  pointer(slider, 'lostpointercapture')
  act(() => vi.runAllTimers())
  expect(onChange.mock.calls).toEqual([[137]])
})

it('updates keyboard changes immediately and discards uncommitted changes on unmount', () => {
  const { slider, onChange } = render()
  input(slider, 121)
  expect(onChange.mock.calls).toEqual([[121]])
  pointer(slider, 'pointerdown')
  input(slider, 140)
  act(() => root.render(null))
  act(() => vi.runAllTimers())
  expect(onChange.mock.calls).toEqual([[121]])
})

it('steps to adjacent even BPM values and disables buttons at the limits', () => {
  const { onChange } = render(121)
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="降低播放速度"]')!.click())
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="提高播放速度"]')!.click())
  expect(onChange.mock.calls).toEqual([[120], [122]])
  render(120, onChange)
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="降低播放速度"]')!.click())
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="提高播放速度"]')!.click())
  expect(onChange.mock.calls.slice(-2)).toEqual([[118], [122]])
  render(10)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="降低播放速度"]')!.disabled).toBe(true)
  render(240)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="提高播放速度"]')!.disabled).toBe(true)
})

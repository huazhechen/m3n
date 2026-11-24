// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { PlaybackProgressControl } from './PlaybackProgressControl'

it('keeps the accessible value and focus stable during playback, while visual progress advances', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onSeekStart = vi.fn(), onSeek = vi.fn(), onSeekCommit = vi.fn()
  const render = (progress: number, isPlaying = true) => act(() => root.render(createElement(PlaybackProgressControl, {
    progress, isPlaying, onSeekStart, onSeek, onSeekCommit,
  })))
  try {
    render(.1)
    const accessible = host.querySelector<HTMLInputElement>('[aria-label="播放位置"]')!
    const visual = host.querySelector<HTMLInputElement>('[aria-hidden="true"]')!
    act(() => accessible.focus())
    for (const progress of [.2, .3, .4]) render(progress)
    expect(visual.value).toBe('400')
    expect(accessible.value).toBe('100')
    expect(accessible.getAttribute('aria-valuetext')).toBe('10%')
    expect(document.activeElement).toBe(accessible)
    expect(onSeek).not.toHaveBeenCalled()
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(accessible, '500')
      accessible.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onSeekStart).toHaveBeenCalledOnce()
    expect(onSeek).toHaveBeenCalledWith(.5)
    expect(onSeekCommit).toHaveBeenCalledOnce()
    render(.6)
    expect(accessible.value).toBe('500')
    render(.6, false)
    expect(accessible.value).toBe('600')
    expect(document.activeElement).toBe(accessible)
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})

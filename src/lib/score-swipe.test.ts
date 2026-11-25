// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { attachScoreSwipe } from './score-swipe'

let root: HTMLElement, paper: HTMLElement, navigate: ReturnType<typeof vi.fn<(direction: 'previous' | 'next') => void>>, destroy: () => void
beforeEach(() => {
  root = document.createElement('main')
  root.innerHTML = '<div class="score-paper"><span>score</span></div><input type="range"><button>settings</button>'
  document.body.append(root)
  paper = root.querySelector('.score-paper')!
  navigate = vi.fn()
  destroy = attachScoreSwipe(root, navigate)
})
afterEach(() => { destroy(); document.body.replaceChildren(); vi.restoreAllMocks() })

function touch(x: number, y = 100, identifier = 1) { return { clientX: x, clientY: y, identifier } }
function send(type: string, touches: ReturnType<typeof touch>[], target: Element = paper, changedTouches = touches) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: changedTouches } })
  target.dispatchEvent(event)
  return event
}
function swipe(from = 250, to = 100, target: Element = paper, y = 100) {
  send('touchstart', [touch(from)], target)
  send('touchmove', [touch(to, y)], target)
  send('touchend', [], target, [touch(to, y)])
}

it('navigates in both directions and consumes the synthetic click before score playback', () => {
  const play = vi.fn()
  paper.addEventListener('click', play)
  swipe()
  expect(navigate.mock.calls).toEqual([['next']])
  expect(paper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).toBe(false)
  expect(play).not.toHaveBeenCalled()
  swipe(100, 250)
  expect(navigate.mock.calls).toEqual([['next'], ['previous']])
  send('touchstart', [touch(150)])
  paper.click()
  expect(play).toHaveBeenCalledOnce()
})
it('leaves taps and vertical or diagonal scrolling available and rejects short drags', () => {
  send('touchstart', [touch(150)])
  expect(send('touchmove', [touch(155, 180)]).defaultPrevented).toBe(false)
  send('touchend', [], paper, [touch(100, 190)])
  swipe(250, 100, paper, 210)
  swipe(200, 160)
  send('touchstart', [touch(150)])
  send('touchend', [], paper, [touch(150)])
  expect(navigate).not.toHaveBeenCalled()
})
it('cancels the entire gesture after a second finger or touchcancel', () => {
  send('touchstart', [touch(250)])
  send('touchstart', [touch(250), touch(300, 100, 2)])
  send('touchend', [touch(250)], paper, [touch(300, 100, 2)])
  send('touchmove', [touch(100)])
  send('touchend', [], paper, [touch(100)])
  send('touchstart', [touch(250)])
  send('touchmove', [touch(100)])
  send('touchcancel', [])
  send('touchend', [], paper, [touch(100)])
  expect(navigate).not.toHaveBeenCalled()
})
it('reserves both viewport edges and ignores controls and open dialogs', () => {
  swipe(15, 200)
  swipe(window.innerWidth - 15, 200)
  swipe(250, 100, root.querySelector('input')!)
  swipe(250, 100, root.querySelector('button')!)
  const dialog = document.createElement('dialog')
  dialog.open = true
  document.body.append(dialog)
  swipe()
  expect(navigate).not.toHaveBeenCalled()
})
it('gives zoomed scores and horizontally overflowing content priority', () => {
  paper.dataset.zoomed = 'true'
  swipe()
  delete paper.dataset.zoomed
  Object.defineProperties(paper, { scrollWidth: { value: 800 }, clientWidth: { value: 390 } })
  swipe(250, 100, paper.firstElementChild!)
  expect(navigate).not.toHaveBeenCalled()
})
it('rejects slow gestures and removes its listeners on cleanup', () => {
  const now = vi.spyOn(performance, 'now')
  now.mockReturnValue(0)
  send('touchstart', [touch(250)])
  send('touchmove', [touch(100)])
  now.mockReturnValue(900)
  send('touchend', [], paper, [touch(100)])
  destroy()
  swipe()
  expect(navigate).not.toHaveBeenCalled()
})

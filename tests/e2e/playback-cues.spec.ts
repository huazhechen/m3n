import { expect, test } from '@playwright/test'
import { openScoreSettings, selectNotationMode } from './score-settings'

test('resume skips the interrupted note and keeps the following rest in the cued measure', async ({ page }) => {
  await page.goto('/editor')
  await expect(page.locator('.score-paper g.note').first()).toBeVisible()
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  await page.getByLabel('M3N source').fill('{2/4}{120qpm}\nN: 1^ | 0 2 | 3^ |||')
  const notes = page.locator('.score-paper [data-reading-event]')
  await expect(notes).toHaveCount(4)
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(notes.first()).toHaveClass(/is-playing/)
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  const measure = page.locator('.score-paper g.measure').nth(1)
  await expect(measure.locator(':scope > .startup-beat-highlight')).toHaveAttribute('data-beat', '1')
  await expect(notes.nth(1)).toHaveClass(/is-playing/)
  await expect(notes.first()).not.toHaveClass(/is-playing/)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible()
})

for (const mode of ['首调', '五线谱'] as const) {
test(`three tempo pulses color the upcoming measure in ${mode}; pause cancels the cue`, async ({ page }) => {
  await page.goto('/editor')
  await expect(page.locator('.score-paper g.note').first()).toBeVisible()
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  await page.getByLabel('M3N source').fill('{4/4}{120qpm}\nN: 0 1 2 3 |||')
  await expect(page.locator('.score-paper g.note, .score-paper g.rest')).toHaveCount(4)
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  await selectNotationMode(page, mode)
  await page.keyboard.press('Escape')
  await expect(page.locator('.score-paper g.note, .score-paper g.rest')).toHaveCount(4)
  const first = page.locator('.score-paper g.note, .score-paper g.rest').first()
  const measure = page.locator('.score-paper g.measure').filter({ has: page.locator('g.note') }).first()
  await openScoreSettings(page)
  const metro = page.getByRole('switch', { name: '节拍器', exact: true })
  if (await metro.isChecked()) await metro.click()
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    const events: { beat: number; at: number }[] = []
    Object.assign(window, { cueEvents: events })
    new MutationObserver(() => {
      const background = document.querySelector('.startup-beat-highlight')
      const beat = Number(background?.getAttribute('data-beat'))
      if (beat && events.at(-1)?.beat !== beat) events.push({ beat, at: performance.now() })
    }).observe(document.querySelector('.score-paper')!, { subtree: true, childList: true })
  })
  await page.getByRole('button', { name: '播放', exact: true }).click()
  for (const [beat, color] of [[1, 'rgb(239, 83, 80)'], [2, 'rgb(253, 216, 53)'], [3, 'rgb(102, 187, 106)']] as const) {
    await expect(measure.locator(':scope > rect.startup-beat-highlight')).toHaveAttribute('data-beat', String(beat))
    await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeEnabled({ timeout: 300 })
    await expect(measure.locator(':scope > rect.startup-beat-highlight')).toHaveCSS('fill', color)
    const geometry = await measure.evaluate(measure => {
      const background = measure.querySelector<SVGRectElement>(':scope > rect.startup-beat-highlight')!
      const rect = background.getBoundingClientRect()
      const music = measure.hasAttribute('data-m3n-ink-bounds')
        ? [measure as SVGGElement] : [...measure.querySelectorAll<SVGGElement>('g.note, g.rest')]
      const notes = music.map(note => {
        // Bravura text line boxes extend beyond the painted glyphs. Staff
        // publishes measure ink bounds; transform those into viewport coordinates.
        const ink = note.getAttribute('data-m3n-ink-bounds')?.split(' ').map(Number)
        if (!ink) return note.getBoundingClientRect()
        const matrix = note.getScreenCTM()!
        const top = new DOMPoint(ink[0], ink[1]).matrixTransform(matrix)
        const bottom = new DOMPoint(ink[0]! + ink[2]!, ink[1]! + ink[3]!).matrixTransform(matrix)
        return { left: top.x, top: top.y, right: bottom.x, bottom: bottom.y }
      })
      return { width: rect.width, height: rect.height,
        containsNotes: notes.every(note => rect.left <= note.left + 1 && rect.right >= note.right - 1
          && rect.top <= note.top + 1 && rect.bottom >= note.bottom - 1),
        behind: measure.firstElementChild === background }
    })
    expect(geometry.width).toBeGreaterThan(50)
    expect(geometry.height).toBeGreaterThan(10)
    expect(geometry.containsNotes).toBe(true)
    expect(geometry.behind).toBe(true)
  }
  await expect(measure.locator(':scope > rect.startup-beat-highlight')).toHaveCount(0)
  await expect(first).toHaveClass(/is-playing/)
  if (mode === '首调') await expect(first.locator('text')).toHaveText('0')
  const pulses = await page.evaluate(() => (window as unknown as { cueEvents: { beat: number; at: number }[] }).cueEvents)
  expect(pulses.map(event => event.beat)).toEqual([1, 2, 3])
  for (let i = 1; i < pulses.length; i++) expect(pulses[i]!.at - pulses[i - 1]!.at).toBeGreaterThan(400)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  for (const beat of [1, 2, 3]) {
    await expect.poll(() => page.locator('.startup-beat-highlight').getAttribute('data-beat')).toBe(String(beat))
    await expect(measure.locator(':scope > .startup-beat-highlight')).toHaveCount(1)
  }
  await expect(page.locator('.startup-beat-highlight')).toHaveCount(0)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.locator('.startup-beat-highlight')).toHaveCount(1)
  await page.getByRole('button', { name: '暂停', exact: true }).click({ timeout: 300 })
  await expect(page.locator('.startup-beat-highlight')).toHaveCount(0, { timeout: 300 })
  await page.waitForTimeout(1700)
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  await expect(page.locator('.score-paper .is-playing')).not.toHaveCount(0)
  await page.getByLabel('M3N source').fill('{4/4}{60qpm}\nN: 0 4 5 6 |||')
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.locator('.startup-beat-highlight')).toHaveCount(1)
  await page.getByRole('button', { name: '暂停', exact: true }).click({ timeout: 300 })
  await expect(page.locator('.startup-beat-highlight')).toHaveCount(0, { timeout: 300 })
  await page.waitForTimeout(3200)
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  await expect(page.locator('.score-paper .is-playing')).toHaveCount(0)
})

}

test('highlights the exact top order occurrence across repeated A and local repeats', async ({ page }) => {
  await page.goto('/editor')
  await expect(page.locator('.score-paper g.note').first()).toBeVisible()
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  await page.getByLabel('M3N source').fill('{2/4}{240qpm}{order=A,B,A}\n===A\nN: ||: 0 1 :||\n===B\nN: 2 3 |||')
  const order = page.locator('.score-paper [data-m3n-order-index]')
  await expect(order).toHaveCount(3)
  await page.getByRole('button', { name: '播放', exact: true }).click()
  for (const index of [0, 1, 2]) {
    await expect(order.nth(index)).toHaveClass(/is-playing/)
    await expect(page.locator('.score-paper [data-m3n-order-index].is-playing')).toHaveCount(1)
  }
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.locator('.score-paper [data-m3n-order-index].is-playing')).toHaveCount(1)
})

test('shows only one closing measure number per complete rendered music row', async ({ page }) => {
  await page.goto('/editor')
  await expect(page.locator('.score-paper g.note').first()).toBeVisible()
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  await page.getByLabel('M3N source').fill('{4/4}\nN: 1 2 3 4 | 2 3 4 5 | {br}3 4 5 6 | 4 5 6 7 |||')
  await page.getByRole('button', { name: '乐谱设置', exact: true }).click()
  const numbers = page.getByRole('switch', { name: '小节号', exact: true })
  if (!await numbers.isChecked()) await numbers.click()
  await expect(page.locator('.score-paper [data-m3n-role="measure-number"]')).toHaveText(['2', '4'])
})

import { expect, test } from '@playwright/test'

test('three tempo pulses color the opening rest, then playback highlights it; pause cancels the cue', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill('{4/4}{120qpm}\nN: 0 1 2 3 |||')
  await expect(page.locator('.score-paper g.note')).toHaveCount(4)
  const first = page.locator('.score-paper g.note').first()
  const metro = page.getByRole('switch', { name: '节拍器', exact: true })
  if (await metro.isChecked()) await metro.click()
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
    await expect(first.locator('rect.startup-beat-highlight')).toHaveAttribute('data-beat', String(beat))
    await expect(first.locator('rect.startup-beat-highlight')).toHaveCSS('fill', color)
    const geometry = await first.evaluate(note => {
      const background = note.querySelector<SVGRectElement>('rect.startup-beat-highlight')!
      const numeral = [...note.querySelectorAll<SVGTextElement>('text')].find(text => /^[0-7]$/.test(text.textContent ?? ''))!
      const rect = background.getBBox(), text = numeral.getBBox()
      const canvas = note.ownerSVGElement!.getBoundingClientRect(), visible = background.getBoundingClientRect()
      return { rect: [rect.x,rect.y,rect.width,rect.height], text: [text.x,text.y,text.width,text.height],
        left: visible.left-canvas.left, right: canvas.right-visible.right }
    })
    geometry.rect.forEach((value,index) => expect(value).toBeCloseTo(geometry.text[index]!,5))
    expect(geometry.left).toBeGreaterThanOrEqual(-0.01)
    expect(geometry.right).toBeGreaterThanOrEqual(-0.01)
  }
  await expect(first.locator('rect.startup-beat-highlight')).toHaveCount(0)
  await expect(first).toHaveClass(/is-playing/)
  expect(await first.textContent()).toBe('0')
  const pulses = await page.evaluate(() => (window as unknown as { cueEvents: { beat: number; at: number }[] }).cueEvents)
  expect(pulses.map(event => event.beat)).toEqual([1, 2, 3])
  for (let i = 1; i < pulses.length; i++) expect(pulses[i]!.at - pulses[i - 1]!.at).toBeGreaterThan(400)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  const next = page.locator('.score-paper g.note').nth(1)
  for (const beat of [1, 2, 3]) {
    await expect(next.locator('.startup-beat-highlight')).toHaveAttribute('data-beat', String(beat))
    await expect(first.locator('.startup-beat-highlight')).toHaveCount(0)
  }
  await expect(page.locator('.startup-beat-highlight')).toHaveCount(0)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.locator('.startup-beat-highlight')).toHaveCount(1)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.locator('.startup-beat-highlight')).toHaveCount(0)
  await page.waitForTimeout(1700)
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  await expect(page.locator('.score-paper .is-playing')).toHaveCount(0)
  await page.getByLabel('M3N source').fill('{4/4}{60qpm}\nN: 0 4 5 6 |||')
  await expect(page.locator('.score-paper g.note').nth(1)).toHaveText('4')
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.locator('.startup-beat-highlight')).toHaveCount(1)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.locator('.startup-beat-highlight')).toHaveCount(0)
  await page.waitForTimeout(3200)
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  await expect(page.locator('.score-paper .is-playing')).toHaveCount(0)
})

test('highlights the exact top order occurrence across repeated A and local repeats', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill('{2/4}{240qpm}{order=A,B,A}\n===A\nN: ||: 0 1 :||\n===B\nN: 2 3 |||')
  const order = page.locator('.score-paper [data-m3n-order-index]')
  await expect(order).toHaveCount(3)
  await page.getByRole('button', { name: '播放', exact: true }).click()
  for (const index of [0, 1, 2]) {
    await expect(order.nth(index)).toHaveClass(/is-playing/)
    await expect(page.locator('.score-paper [data-m3n-order-index].is-playing')).toHaveCount(1)
  }
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.locator('.score-paper [data-m3n-order-index].is-playing')).toHaveCount(0)
})

test('shows only one closing measure number per complete rendered music row', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill('{4/4}\nN: 1 2 3 4 | 2 3 4 5 | {br}3 4 5 6 | 4 5 6 7 |||')
  await page.getByRole('button', { name: '乐谱设置', exact: true }).click()
  const numbers = page.getByRole('switch', { name: '小节号', exact: true })
  if (!await numbers.isChecked()) await numbers.click()
  await expect(page.locator('.score-paper [data-m3n-role="measure-number"]')).toHaveText(['2', '4'])
})

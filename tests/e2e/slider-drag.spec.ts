import { expect, test } from '@playwright/test'
import { openScoreSettings } from './score-settings'

for (const name of ['播放速度', '乐谱宽度']) {
  test(`${name} keeps score layout unchanged during a held drag and applies on release`, async ({ page }) => {
    await page.goto('/scores/huan_le_song_01')
    await openScoreSettings(page)
    const paper = page.locator('.score-paper')
    await expect(paper.locator('svg').first()).toBeVisible()
    const slider = page.getByRole('slider', { name, exact: true })
    const bounds = (await slider.boundingBox())!
    const before = await paper.innerHTML()
    await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height / 2)
    await page.mouse.down()
    for (const fraction of [0.5, 0.6, 0.8]) {
      await page.mouse.move(bounds.x + bounds.width * fraction, bounds.y + bounds.height / 2, { steps: 5 })
      // Exceeds the old 150ms throttle while keeping the pointer held down.
      await page.waitForTimeout(200)
      expect(await paper.innerHTML()).toBe(before)
    }
    const finalValue = await slider.inputValue()
    await expect(slider.locator('xpath=../..').locator('output')).toHaveText(
      name === '播放速度' ? `${finalValue} BPM` : `${Number(finalValue) * 24}px`,
    )
    await page.mouse.up()
    await expect.poll(() => paper.innerHTML()).not.toBe(before)
    await expect(slider).toHaveValue(finalValue)
  })
}

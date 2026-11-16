import { expect, test } from '@playwright/test'
import { openScoreSettings } from './score-settings'

test.use({ hasTouch: true })

test('icons stay at eighty percent of buttons across phones, tablets and rotation', async ({ page }, info) => {
  await page.goto('/scores/huan_le_song_01')
  for (const [width, height, iconSize, buttonSize, barHeight] of [
    [320, 900, 25.6, 32, 37],
    [390, 844, 25.6, 32, 38.09375],
    [844, 390, 25.6, 32, 38.09375],
    [744, 1133, 37.2, 46.5, 58.125],
    [1133, 744, 37.2, 46.5, 58.125],
    [1280, 900, 45, 56.25, 68.25],
    [2560, 1920, 96, 120, 132],
    [3840, 2880, 144, 180, 192],
  ]) {
    await page.setViewportSize({ width: width!, height: height! })
    for (const selector of ['.top-nav svg', '.brand-mark img', '.floating-controls .control-button svg']) {
      const icon = (await page.locator(selector).first().boundingBox())!
      expect(icon.width).toBeCloseTo(iconSize!, 1)
      expect(icon.height).toBeCloseTo(iconSize!, 1)
    }
    expect((await page.locator('.top-nav').boundingBox())!.height).toBeCloseTo(barHeight!, 1)
    expect((await page.locator('.top-nav nav a').last().boundingBox())!.height).toBeCloseTo(buttonSize!, 1)
    await openScoreSettings(page)
    const panel = page.getByRole('dialog', { name: '乐谱设置', exact: true })
    const bounds = (await panel.boundingBox())!
    const bar = (await page.locator('.floating-controls').boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width!)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThan(bar.y)
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(await page.locator('.top-nav button, .top-nav nav a, .audio-controls button').evaluateAll(buttons => buttons.every(button => {
      if (!button.checkVisibility()) return true
      const bounds = button.getBoundingClientRect()
      return [...button.querySelectorAll('svg, .transpose-key-icon')].every(icon => {
        const rect = icon.getBoundingClientRect()
        return rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom
      })
    }))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 744 || width === 844) await page.screenshot({ path: info.outputPath(`controls-${width}.png`) })
    await page.keyboard.press('Escape')
  }
  await page.goto('/editor')
  const icon = (await page.locator('.editor-action svg').first().boundingBox())!
  expect(icon.width).toBeCloseTo(144, 1)
})

test('document notes retain their own short-side scale during height-only window changes', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 900 })
  await page.goto('/?doc=guide')
  const svg = page.locator('.document-example .score-paper svg').first()
  await expect(svg).toBeVisible({ timeout: 15_000 })
  for (const [height, noteSize] of [[900, 24], [390, 12.1875], [744, 23.25]]) {
    await page.setViewportSize({ width: 844, height: height! })
    await expect(svg).toBeVisible()
    await expect.poll(() => svg.evaluate(element => {
      const width = Number(element.getAttribute('width'))
      return Math.round(element.getBoundingClientRect().width / width * 22 * 10) / 10
    })).toBeCloseTo(noteSize!, 0)
  }
})

test.describe('desktop', () => {
  test.use({ hasTouch: false })
  test('navigation and large buttons fit between narrow and wide windows', async ({ page }) => {
    await page.goto('/scores/huan_le_song_01')
    for (const width of [721, 744, 1280, 2560]) {
      await page.setViewportSize({ width, height: 1920 })
      await expect(page.locator('.top-nav .nav-action-label').first()).toBeVisible()
      expect(await page.locator('.top-nav').evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return [...element.querySelectorAll('nav a, nav button, nav [aria-disabled]')].every(button => {
          const rect = button.getBoundingClientRect()
          return rect.left >= bounds.left && rect.right <= bounds.right
        })
      })).toBe(true)
    }
  })
})

import { expect, test } from '@playwright/test'
import { openScoreSettings } from './score-settings'

test.use({ hasTouch: true })

test('icons and bars share a short-side scale across phones, tablets and rotation', async ({ page }, info) => {
  await page.goto('/scores/huan_le_song_01')
  for (const [width, height, iconSize, buttonSize, barHeight] of [
    [320, 900, 10, 32, 37],
    [390, 844, 12.1875, 32, 38.09375],
    [844, 390, 12.1875, 32, 38.09375],
    [744, 1133, 23.25, 46.5, 58.125],
    [1133, 744, 23.25, 46.5, 58.125],
    [1280, 900, 24, 48, 60],
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 744 || width === 844) await page.screenshot({ path: info.outputPath(`controls-${width}.png`) })
    await page.keyboard.press('Escape')
  }
  await page.goto('/editor')
  const icon = (await page.locator('.editor-action svg').first().boundingBox())!
  expect(icon.width).toBeCloseTo(24, 1)
})

test('document notes follow the same scale, including height-only window changes', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 900 })
  await page.goto('/?doc=guide')
  const svg = page.locator('.document-example .score-paper svg').first()
  for (const [height, noteSize] of [[900, 24], [390, 12.1875], [744, 23.25]]) {
    await page.setViewportSize({ width: 844, height: height! })
    await expect(svg).toBeVisible()
    await expect.poll(() => svg.evaluate(element => {
      const width = Number(element.getAttribute('width'))
      return Math.round(element.getBoundingClientRect().width / width * 22 * 10) / 10
    })).toBeCloseTo(noteSize!, 0)
    expect((await page.locator('.top-nav svg').first().boundingBox())!.width).toBeCloseTo(noteSize!, 1)
  }
})

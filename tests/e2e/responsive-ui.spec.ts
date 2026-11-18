import { expect, test } from '@playwright/test'
import { openScoreSettings } from './score-settings'

test.use({ hasTouch: true })

test('tablet settings fit their content and share the interface scale', async ({ page }, info) => {
  await page.goto('/scores/huan_le_song_01')
  const panel = page.getByRole('dialog', { name: '乐谱设置', exact: true })
  let portraitHeight = 0
  for (const [width, height] of [[744, 1133], [744, 1400], [1133, 744], [768, 1024], [1024, 768], [844, 390]]) {
    await page.setViewportSize({ width: width!, height: height! })
    await openScoreSettings(page)
    await expect(panel).toBeVisible()
    const buttonSize = Math.min(48, Math.max(36, Math.min(width!, height!) / 16))
    for (const name of ['还原速度', '还原宽度']) {
      const button = panel.getByRole('button', { name, exact: true })
      await expect(button.locator('span')).toHaveCount(0)
      const bounds = (await button.boundingBox())!
      expect(bounds.width).toBeCloseTo(buttonSize, 1)
      expect(bounds.height).toBeCloseTo(buttonSize, 1)
      expect((await button.locator('svg').boundingBox())!.width).toBeCloseTo(buttonSize * .8, 1)
    }
    const bounds = (await panel.boundingBox())!
    expect(bounds.height).toBeLessThan(buttonSize * 5 + 100)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThan((await page.locator('.floating-controls').boundingBox())!.y)
    const optionHeights = await panel.locator('.control-options button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height))
    expect(optionHeights.every(value => value >= buttonSize && value < buttonSize * 2 + 4)).toBe(true)
    if (width === 744 && height === 1133) portraitHeight = bounds.height
    if (width === 744 && height === 1400) expect(bounds.height).toBeCloseTo(portraitHeight, 0)
    if (width === 744 || width === 1133) await page.screenshot({ path: info.outputPath(`tablet-settings-${width}-${height}.png`) })
    await page.keyboard.press('Escape')
  }
})

test('icons stay at eighty percent of buttons across phones, tablets and rotation', async ({ page }, info) => {
  await page.goto('/scores/huan_le_song_01')
  for (const [width, height, iconSize, buttonSize, barHeight] of [
    [320, 900, 28.8, 36, 45],
    [390, 844, 28.8, 36, 45],
    [844, 390, 28.8, 36, 45],
    [744, 1133, 37.2, 46.5, 58.125],
    [1133, 744, 37.2, 46.5, 58.125],
    [1280, 900, 38.4, 48, 60],
    [2560, 1920, 38.4, 48, 60],
    [3840, 2880, 38.4, 48, 60],
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
    const fontSize = await panel.locator('.control-row-label').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))
    expect(fontSize).toBeCloseTo(buttonSize! * .375, 1)
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
  expect(icon.width).toBeCloseTo(38.4, 1)
})

test('touch document notes use half the shared scale between eighteen and twenty-four', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 900 })
  await page.goto('/?doc=guide')
  const svg = page.locator('.document-example .score-paper svg').first()
  await expect(svg).toBeVisible({ timeout: 15_000 })
  for (const [height] of [[900], [390], [744]]) {
    await page.setViewportSize({ width: 844, height: height! })
    await expect(svg).toBeVisible()
    await expect.poll(() => svg.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(300)
  }
})

test.describe('desktop', () => {
  test.use({ hasTouch: false })
  test('navigation and large buttons fit between narrow and wide windows', async ({ page }) => {
    await page.goto('/scores/huan_le_song_01')
    for (const width of [721, 744, 1280, 2560]) {
      await page.setViewportSize({ width, height: 1920 })
      await expect(page.locator('.top-nav .nav-action-label').first()).toBeVisible()
      await expect(page.locator('.floating-controls .playback-toggle')).toHaveCSS('height', '36px')
      expect((await page.locator('.floating-controls .playback-toggle svg').boundingBox())!.width).toBeCloseTo(28.8, 1)
      await expect(page.locator('.audio-controls')).toHaveCSS('font-size', '13.5px')
      await expect(page.locator('main')).toHaveCSS('padding-top', '4.5px')
      expect(await page.locator('.top-nav').evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return [...element.querySelectorAll('nav a, nav button, nav [aria-disabled]')].every(button => {
          const rect = button.getBoundingClientRect()
          return rect.left >= bounds.left && rect.right <= bounds.right
        })
      }), `navigation at ${width}px`).toBe(true)
    }
  })
})

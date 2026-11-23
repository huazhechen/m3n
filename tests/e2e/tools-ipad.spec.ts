import { expect, test } from '@playwright/test'

test('metronome fills the available iPad mini viewport in both orientations', async ({ page }) => {
  for (const [width, height] of [[768, 1024], [1024, 768], [744, 1133], [1133, 744]]) {
    await page.setViewportSize({ width: width!, height: height! })
    await page.goto('/tools/metronome')
    const card = (await page.locator('.metronome-tool').boundingBox())!
    expect(card.x).toBe(9)
    expect(card.width).toBe(width! - 18)
    expect(card.y + card.height).toBeGreaterThan(height! - 12)
    expect(card.y + card.height).toBeLessThanOrEqual(height!)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('scale digits have centered ink and clear octave dots across all keys and tunings', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('/tools/scales')
  for (const tuning of ['standard', 'c6', 'diminished', 'full-blow-draw']) {
    await page.getByLabel('选择调音方式').selectOption(tuning)
    for (const key of await page.getByRole('group', { name: '选择大调' }).getByRole('button').all()) {
      await key.click()
      const problems = await page.locator('.harmonica-tile').evaluateAll(tiles => {
        const context = document.createElement('canvas').getContext('2d')!
        return tiles.flatMap(tile => {
          const rect = tile.querySelector('rect')!
          const digit = tile.querySelector<SVGTextElement>('.degree-number')!
          const style = getComputedStyle(digit)
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
          const ink = context.measureText(digit.textContent!)
          const top = digit.y.baseVal[0]!.value - ink.actualBoundingBoxAscent
          const bottom = digit.y.baseVal[0]!.value + ink.actualBoundingBoxDescent
          const tileY = Number(rect.getAttribute('y'))
          const centered = Math.abs((top + bottom) / 2 - tileY - 22) <= 2
          const clearDots = [...tile.querySelectorAll('circle')].every(dot => {
            const y = Number(dot.getAttribute('cy')), r = Number(dot.getAttribute('r'))
            return (y + r < top - 2 || y - r > bottom + 2) && y - r >= tileY && y + r <= tileY + 44
          })
          return centered && clearDots ? [] : [{ title: tile.querySelector('title')!.textContent, top, bottom, tileY }]
        })
      })
      expect(problems).toEqual([])
    }
  }
})

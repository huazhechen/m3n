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
  for (const tuning of ['标准', 'C6', '减音阶', '全吹吸']) {
    await page.getByRole('group', { name: '选择调音方式' }).getByRole('button', { name: tuning, exact: true }).click()
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

test('four tuning buttons stay in one row and switch selection on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/tools/scales')
  const buttons = page.getByRole('group', { name: '选择调音方式' }).getByRole('button')
  await expect(buttons).toHaveText(['标准', 'C6', '减音阶', '全吹吸'])
  const bounds = await buttons.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect()
    return { y: rect.y, width: rect.width }
  }))
  expect(new Set(bounds.map(rect => rect.y)).size).toBe(1)
  expect(Math.max(...bounds.map(rect => rect.width)) - Math.min(...bounds.map(rect => rect.width))).toBeLessThan(1)
  for (const button of await buttons.all()) {
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.scale-tuning-picker button[aria-pressed=true]')).toHaveCount(1)
    await expect(page.locator('.harmonica-tile')).toHaveCount(48)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('tuning buttons share the title row when space permits and wrap together when narrow', async ({ page }) => {
  for (const width of [768, 320]) {
    await page.setViewportSize({ width, height: 1024 })
    await page.goto('/tools/scales')
    const title = (await page.getByRole('heading', { name: '半音阶口琴·音阶', exact: true }).boundingBox())!
    const picker = (await page.getByRole('group', { name: '选择调音方式' }).boundingBox())!
    if (width === 768) {
      expect(picker.x).toBeGreaterThan(title.x + title.width)
      expect(Math.abs(picker.y + picker.height / 2 - title.y - title.height / 2)).toBeLessThan(1)
    } else {
      expect(picker.y).toBeGreaterThan(title.y + title.height)
      expect(picker.x).toBeCloseTo(title.x, 0)
    }
  }
})

test('all tuning key colors use the same fixed 0–160 score scale', async ({ page }) => {
  await page.goto('/tools/scales')
  for (const tuning of await page.getByRole('group', { name: '选择调音方式' }).getByRole('button').all()) {
    await tuning.click()
    const colors = await page.locator('.scale-key-picker button').evaluateAll(buttons => buttons.map(button => {
      const score = Number(button.querySelector('span')!.textContent!.match(/\d+/)![0])
      const expected = document.createElement('span')
      expected.style.color = `hsl(${120 - 120 * Math.max(0, Math.min(160, score)) / 160} 75% 72%)`
      document.body.append(expected)
      const result = { actual: getComputedStyle(button).backgroundColor, expected: getComputedStyle(expected).color }
      expected.remove()
      return result
    }))
    for (const color of colors) expect(color.actual).toBe(color.expected)
  }
})

import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const littleRedRidingHood = readFileSync(new URL('../../src/scores/xiao_hong_mao_01.m3n', import.meta.url), 'utf8')

for (const width of [390, 1280]) {
  for (const mode of ['continuous', 'paged']) {
    test(`Little Red Riding Hood highlight stays within its engraved row at ${width}px in ${mode} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(mode => localStorage.setItem('m3n:render-mode', mode), mode)
      await page.goto('/editor')
      await page.getByLabel('M3N source').fill(littleRedRidingHood.replace('108qpm', '240qpm'))
      const preview = page.getByRole('tab', { name: '预览', exact: true })
      if (await preview.isVisible()) await preview.click()
      await expect(page.locator('.score-paper g.measure')).toHaveCount(24)
      await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
      await page.getByRole('button', { name: '播放', exact: true }).click()
      const cue = page.locator('.score-paper .startup-beat-highlight')
      await expect(cue).toHaveCount(1)
      const rowBounds = (band: SVGRectElement) => {
        const system = band.closest<SVGGElement>('g.system')!
        return {
          y: band.y.baseVal.value, height: band.height.baseVal.value,
          top: Number(system.dataset.m3nTop), bottom: Number(system.dataset.m3nBottom),
        }
      }
      const startup = await cue.evaluate(rowBounds)
      expect(startup.y).toBeCloseTo(startup.top, 4)
      expect(startup.height).toBeCloseTo(startup.bottom - startup.top, 4)
      await expect(page.locator('.score-paper .measure-playback-highlight')).toHaveCount(24, { timeout: 25_000 })
      const bands = await page.locator('.score-paper .measure-playback-highlight').evaluateAll(elements => elements.map(element => {
        const band = element as SVGRectElement
        const system = band.closest<SVGGElement>('g.system')!
        return { y: band.y.baseVal.value, height: band.height.baseVal.value,
          top: Number(system.dataset.m3nTop), bottom: Number(system.dataset.m3nBottom) }
      }))
      for (const band of bands) {
        expect(band.y).toBeCloseTo(band.top, 4)
        expect(band.height).toBeCloseTo(band.bottom - band.top, 4)
      }
    })

    test(`playback measure highlight covers the space after the previous bar at ${width}px in ${mode} mode`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(mode => localStorage.setItem('m3n:render-mode', mode), mode)
      await page.goto('/editor')
      await page.getByLabel('M3N source').fill('{4/4}{60qpm}\nN: 1 2 3 4 | 5 6 7 1e |||\nL: 一二三四五六七八')
      const preview = page.getByRole('tab', { name: '预览', exact: true })
      if (await preview.isVisible()) await preview.click()
      await expect(page.locator('.score-paper g.note')).toHaveCount(8)
      await expect(page.locator('.score-paper')).toBeVisible()
      await page.getByRole('button', { name: '播放', exact: true }).click()
      const second = page.locator('.score-paper g.measure').nth(1)
      await expect(second).toHaveClass(/is-playing-measure/, { timeout: 20_000 })
      const bounds = await second.evaluate(element => {
        const band = element.querySelector<SVGRectElement>('.measure-playback-highlight')!.getBBox()
        const previous = element.previousElementSibling!
        const bars = [...previous.querySelectorAll<SVGRectElement>('rect')]
          .filter(rect => rect.width.baseVal.value < 10 && rect.height.baseVal.value > 20)
        const barRight = Math.max(...bars.map(rect => rect.x.baseVal.value + rect.width.baseVal.value))
        const note = element.querySelector<SVGGraphicsElement>('g.note')!.getBBox()
        return { bandLeft: band.x, bandRight: band.x + band.width, barRight, noteLeft: note.x, noteRight: note.x + note.width }
      })
      expect(bounds.barRight).toBeGreaterThan(0)
      expect(bounds.bandLeft).toBeLessThanOrEqual(bounds.barRight)
      expect(bounds.bandLeft).toBeGreaterThanOrEqual(bounds.barRight - 6)
      expect(bounds.bandRight).toBeGreaterThanOrEqual(bounds.noteRight)
      await page.screenshot({ path: info.outputPath('measure-highlight.png') })
      await page.getByRole('button', { name: '暂停', exact: true }).click()
      await expect(page.locator('.score-paper .is-playing-measure')).toHaveCount(0)
    })
  }
}

test('a measure after a section break starts at its own opening repeat during playback', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill('{4/4}{120qpm}\nN: 1 2 3 4 ||\n---\nN: ||: 5 6 7 1e | 4 3 2 1 :||')
  const preview = page.getByRole('tab', { name: '预览', exact: true })
  if (await preview.isVisible()) await preview.click()
  await expect(page.locator('.score-paper g.measure')).toHaveCount(3)
  await page.getByRole('button', { name: '播放', exact: true }).click()
  const second = page.locator('.score-paper g.measure').nth(1)
  await expect(second).toHaveClass(/is-playing-measure/, { timeout: 20_000 })
  const bounds = await second.evaluate(element => {
    const band = element.querySelector<SVGRectElement>('.measure-playback-highlight')!.getBBox()
    const opening = element.querySelector('g')!
    const bars = [...opening.querySelectorAll<SVGRectElement>('rect')].filter(rect => rect.height.baseVal.value > 20)
    return { bandLeft: band.x, barLeft: Math.min(...bars.map(rect => rect.x.baseVal.value)) }
  })
  expect(bounds.bandLeft).toBeCloseTo(bounds.barLeft - 5, 2)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
})

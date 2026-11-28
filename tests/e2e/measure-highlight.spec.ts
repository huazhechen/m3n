import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const littleRedRidingHood = readFileSync(new URL('../../src/scores/xiao_hong_mao_01.m3n', import.meta.url), 'utf8')

for (const width of [390, 1280]) {
  for (const mode of ['continuous', 'paged']) {
    test(`Little Red Riding Hood highlight follows row and barline bounds at ${width}px in ${mode} mode`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(mode => localStorage.setItem('m3n:render-mode', mode), mode)
      await page.goto('/editor')
      await page.locator('.score-paper g.note').first().waitFor({ state: 'attached' })
      await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
      await page.getByLabel('M3N source').fill(littleRedRidingHood.replace('108qpm', '360qpm'))
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
      // Observe the last measure promptly and pause before its short final beat
      // ends; geometry inspection and screenshots then have no timing race.
      await expect.poll(() => page.locator('.score-paper .measure-playback-highlight').count(),
        { timeout: 25_000, intervals: [20] }).toBe(24)
      await page.getByRole('button', { name: '暂停', exact: true }).click()
      await expect(page.locator('.score-paper .is-playing-measure')).toHaveCount(1)
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
      // Row extent and barline alignment use the same highlight rectangles;
      // verify both after one real playback traversal. Hidden rectangles have
      // a zero getBBox(), so read their actual engraved SVG coordinates.
      const bounds = await page.locator('.score-paper').evaluate(paper => {
        const system = [...paper.querySelectorAll('g.system')].find(system => system.querySelectorAll('g.measure').length > 1)!
        const [previous, second] = [...system.querySelectorAll('g.measure')]
        const band = second!.querySelector<SVGRectElement>('.measure-playback-highlight')!
        const note = second!.querySelector<SVGGraphicsElement>('g.note')!.getBBox()
        const bars = [...previous!.querySelectorAll<SVGRectElement>('[data-m3n-role="bar"] rect')]
        const closing = [...second!.querySelectorAll<SVGRectElement>('[data-m3n-role="bar"] rect')]
        return { left: band.x.baseVal.value, right: band.x.baseVal.value + band.width.baseVal.value, noteRight: note.x + note.width,
          opening: Math.max(...bars.map(rect => rect.x.baseVal.value + rect.width.baseVal.value)),
          closing: Math.max(...closing.map(rect => rect.x.baseVal.value + rect.width.baseVal.value)) }
      })
      expect(bounds.opening).toBeGreaterThan(0)
      expect(bounds.left).toBeCloseTo(bounds.opening, 4)
      expect(bounds.right).toBeCloseTo(bounds.closing, 4)
      expect(bounds.right).toBeGreaterThanOrEqual(bounds.noteRight)
      await page.screenshot({ path: info.outputPath('measure-highlight.png') })
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
  expect(bounds.bandLeft).toBeCloseTo(bounds.barLeft, 4)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
})

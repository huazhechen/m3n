import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) {
  for (const mode of ['continuous', 'paged']) {
    test(`playback measure highlight covers the space after the previous bar at ${width}px in ${mode} mode`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(mode => localStorage.setItem('m3n:render-mode', mode), mode)
      await page.goto('/editor')
      await page.getByLabel('M3N source').fill('{4/4}{60qpm}\nN: 1 2 3 4 | 5 6 7 1e |||\nL: 一二三四五六七八')
      await expect(page.locator('.score-paper g.note')).toHaveCount(8)
      const preview = page.getByRole('tab', { name: '预览', exact: true })
      if (await preview.isVisible()) await preview.click()
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

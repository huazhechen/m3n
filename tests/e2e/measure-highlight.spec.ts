import { expect, test } from '@playwright/test'
import { waitForEditor } from './editor-state'

// Two representative display paths; geometry itself is covered in layout tests.
for (const [width, mode] of [[1280, 'continuous'], [390, 'paged']] as const) {
  test(`highlight respects row and barline bounds at ${width}px in ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(mode => localStorage.setItem('m3n:render-mode', mode), mode)
    await page.goto('/editor')
    await waitForEditor(page)
    await page.getByLabel('M3N source').fill('{4/4}{360qpm}\nN: 1 2 3 4 | 5 6 7 1e |{br} ||: 4 3 2 1 :||')
    const preview = page.getByRole('tab', { name: '预览', exact: true })
    if (await preview.isVisible()) await preview.click()
    await expect(page.locator('.score-paper g.measure')).toHaveCount(3)
    await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
    await page.getByRole('button', { name: '播放', exact: true }).click()
    const cue = page.locator('.score-paper .startup-beat-highlight')
    await expect(cue).toHaveCount(1)
    const row = await cue.evaluate((band: SVGRectElement) => {
      const system = band.closest<SVGGElement>('g.system')!
      return { y: band.y.baseVal.value, height: band.height.baseVal.value,
        top: Number(system.dataset.m3nTop), bottom: Number(system.dataset.m3nBottom) }
    })
    expect(row.y).toBeCloseTo(row.top, 4)
    expect(row.height).toBeCloseTo(row.bottom - row.top, 4)
    await expect.poll(() => page.locator('.score-paper .measure-playback-highlight').count(), { intervals: [20] }).toBe(3)
    await page.getByRole('button', { name: '暂停', exact: true }).click()
    const bounds = await page.locator('.score-paper').evaluate(paper => {
      const measures = [...paper.querySelectorAll('g.measure')]
      return measures.map((measure, index) => {
        const band = measure.querySelector<SVGRectElement>('.measure-playback-highlight')!
        const system = measure.closest<SVGGElement>('g.system')!
        const bars = (element: Element) => [...element.querySelectorAll<SVGRectElement>('[data-m3n-role="bar"] rect')]
        const opening = index === 1
          ? Math.max(...bars(measures[0]!).map(rect => rect.x.baseVal.value + rect.width.baseVal.value))
          : index === 2 ? Math.min(...[...measure.querySelector('g')!.querySelectorAll<SVGRectElement>('rect')].filter(rect => rect.height.baseVal.value > 20).map(rect => rect.x.baseVal.value)) : null
        return { left: band.x.baseVal.value, opening, y: band.y.baseVal.value, height: band.height.baseVal.value,
          top: Number(system.dataset.m3nTop), bottom: Number(system.dataset.m3nBottom),
          right: band.x.baseVal.value + band.width.baseVal.value,
          closing: Math.max(...bars(measure).map(rect => rect.x.baseVal.value + rect.width.baseVal.value)) }
      })
    })
    for (const band of bounds) {
      expect(band.y).toBeCloseTo(band.top, 4)
      expect(band.height).toBeCloseTo(band.bottom - band.top, 4)
      if (band.opening !== null) expect(band.left).toBeCloseTo(band.opening, 4)
      expect(band.right).toBeCloseTo(band.closing, 4)
    }
  })
}

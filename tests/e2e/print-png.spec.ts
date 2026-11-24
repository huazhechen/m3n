import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { openScoreSettings } from './score-settings'

test('continuous preview has the image frame and PNG preserves the same score fonts', async ({ page }, info) => {
  const fontRequests: string[] = []
  await page.route(/\.(?:otf|ttf|woff2?)(?:$|\?)/, route => {
    fontRequests.push(route.request().url())
    return route.continue()
  })
  await page.addInitScript(() => { localStorage.setItem('m3n:render-mode', 'continuous') })
  await page.goto('/editor')
  await page.getByRole('textbox', { name: 'M3N source' }).fill('{title=中文打印验证}{4/4}\nN: 1 2 3 4 |||\nL: 春天来了')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  for (const paged of [false, true]) {
    if (paged) {
      await openScoreSettings(page)
      await page.getByRole('switch', { name: '分页', exact: true }).click()
      // This one-line fixture settles at 540px after the initial 640px render.
      await expect(page.getByRole('slider', { name: '乐谱宽度', exact: true })).toHaveValue('540')
      await expect(page.locator('.score-paper .score-page-sheet svg').first()).toHaveAttribute('width', '540')
      await page.keyboard.press('Escape')
    }
    await page.getByRole('button', { name: '打印', exact: true }).click()
    const dialog = page.locator('.export-dialog')
    await expect(dialog.locator('.export-preview')).toHaveAttribute('aria-busy', 'false')
    const geometry = await dialog.locator('.export-preview-paper > div > svg, .export-preview-page > svg').first().evaluate(svg => {
      const root = svg as SVGSVGElement
      const score = root.querySelector<SVGSVGElement>('svg[data-engine="m3n"]') ?? root
      const outer = root.getBoundingClientRect()
      const origin = new DOMPoint(0, 0).matrixTransform(score.getScreenCTM()!)
      const end = new DOMPoint(score.viewBox.baseVal.width, 0).matrixTransform(score.getScreenCTM()!)
      return { width: score.viewBox.baseVal.width, height: score.viewBox.baseVal.height,
        frameWidth: root.viewBox.baseVal.width, frameHeight: root.viewBox.baseVal.height,
        left: origin.x - outer.left, top: origin.y - outer.top, right: outer.right - end.x }
    })
    if (!paged) {
      await expect(dialog.locator('.export-preview')).toContainText('https://score.cheesefans.com/')
      expect(geometry.frameWidth).toBeCloseTo(geometry.width * 1.12)
      expect(geometry.frameHeight).toBeCloseTo(geometry.height + geometry.width * .12)
      expect(geometry.left).toBeGreaterThan(0)
      expect(geometry.top).toBeCloseTo(geometry.left, 1)
      expect(geometry.right).toBeCloseTo(geometry.left, 1)
    }
    await dialog.locator('.export-preview').screenshot({ path: info.outputPath(paged ? 'paged-preview.png' : 'continuous-preview.png') })
    const startedAt = Date.now()
    const downloading = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'PNG', exact: true }).click()
    const download = await downloading
    await info.attach(paged ? 'paged-png-ms' : 'continuous-png-ms', { body: String(Date.now() - startedAt), contentType: 'text/plain' })
    const file = info.outputPath(paged ? 'paged.png' : 'continuous.png')
    await download.saveAs(file)
    const bytes = await readFile(file)
    expect(bytes.subarray(1, 4).toString()).toBe('PNG')
    expect(bytes.readUInt32BE(16)).toBe(Math.ceil(geometry.width * 1.12 * 4))
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(0)
    expect(bytes.length).toBeGreaterThan(3000)
    expect(fontRequests.some(url => /NotoSansSC/.test(url))).toBe(true)
    await expect(dialog).not.toBeVisible()
  }
})

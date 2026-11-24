import { expect, test } from '@playwright/test'

for (const [notation, mode] of ['movable', 'staff'].flatMap(notation =>
  ['paged', 'continuous'].map(mode => [notation, mode] as const))) {
  test(`${notation} ${mode}: wheel zoom changes display size without re-engraving`, async ({ page }) => {
    await page.addInitScript(({ mode, notation }) => {
      localStorage.setItem('m3n:notation-mode', notation)
      localStorage.setItem('m3n:render-mode', mode)
      localStorage.setItem('m3n:local-scores', JSON.stringify([{
        id: 'local-zoom-test', source: '{title=缩放测试}{4/4}\nN: 1 2 3 4 |||',
        createdAt: '2026-11-24T00:00:00Z', expiresAt: null,
      }]))
    }, { mode, notation })
    await page.goto('/scores/local-zoom-test')
    const paper = page.locator('.score-paper')
    const reset = page.getByRole('button', { name: '恢复原始大小' })
    await expect(reset).toHaveCount(0)
    const svg = paper.locator('svg').first()
    await expect(svg).toBeVisible()
    await expect(paper).not.toHaveAttribute('aria-busy', 'true')
    if (mode === 'paged') await expect(paper).toHaveAttribute('data-viewport-paged', 'true')
    if (notation === 'movable' && mode === 'paged') {
      await expect.poll(() => svg.getAttribute('viewBox')).not.toMatch(/^0 0 640 /)
      await expect(paper).not.toHaveAttribute('aria-busy', 'true')
    }
    const before = await svg.boundingBox()
    const markup = await svg.evaluate(element => element.outerHTML)
    await svg.evaluate(element => { element.setAttribute('data-zoom-original', '') })
    await page.mouse.move(before!.x + before!.width / 2, before!.y + Math.min(100, before!.height / 2))
    await page.mouse.wheel(0, -150)
    await expect.poll(async () => (await svg.boundingBox())!.width).toBeGreaterThan(before!.width * 1.2)
    await expect(reset).toBeInViewport()
    await expect(svg).toHaveAttribute('data-zoom-original', '')
    expect(await svg.evaluate(element => { element.removeAttribute('data-zoom-original'); return element.outerHTML })).toBe(markup)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, 150)
    await page.keyboard.up('Control')
    await expect.poll(async () => Math.abs((await svg.boundingBox())!.width - before!.width)).toBeLessThan(1)
    await expect(reset).toHaveCount(0)
    for (const [deltaY, scale] of [[-200, 2], [200, 0.5]]) {
      await paper.evaluate((element, deltaY) => {
        const bounds = element.getBoundingClientRect()
        for (let i = 0; i < 10; i++) element.dispatchEvent(new WheelEvent('wheel', {
          deltaY, clientX: bounds.left + 50, clientY: bounds.top + 50, cancelable: true,
        }))
      }, deltaY!)
      await expect.poll(async () => Math.abs((await svg.boundingBox())!.width / before!.width - scale!)).toBeLessThan(0.01)
      await expect(reset).toBeInViewport()
      await reset.click()
      await expect(reset).toHaveCount(0)
      await expect.poll(async () => Math.abs((await svg.boundingBox())!.width - before!.width)).toBeLessThan(1)
    }
  })
}

test('touch pinch scales only the score and leaves single-finger scrolling available', async ({ browser, browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'Uses Chromium touch input')
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.addInitScript(() => {
    localStorage.setItem('m3n:render-mode', 'paged')
    localStorage.setItem('m3n:local-scores', JSON.stringify([{
      id: 'local-zoom-touch', source: '{title=双指缩放}{4/4}\nN: 1 2 3 4 |||',
      createdAt: '2026-11-24T00:00:00Z', expiresAt: null,
    }]))
  })
  await page.goto('/scores/local-zoom-touch')
  const paper = page.locator('.score-paper')
  await expect(paper.locator('svg')).toBeVisible()
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  const svg = paper.locator('svg')
  const before = await svg.boundingBox()
  const session = await context.newCDPSession(page)
  const y = before!.y + 100
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 130, y, id: 1 }, { x: 230, y, id: 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 30, y, id: 1 }, { x: 330, y, id: 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => (await svg.boundingBox())!.width).toBeGreaterThan(before!.width * 1.8)
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(1)
  const scrollBefore = await page.evaluate(() => scrollY)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 500, id: 1 }] })
  for (const y of [460, 420, 380, 340]) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y, id: 1 }] })
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrollBefore)
  const reset = page.getByRole('button', { name: '恢复原始大小' })
  await expect(reset).toBeInViewport()
  // A tap during mobile momentum scrolling stops the scroll and is consumed
  // by the browser. Wait for the gesture to finish before testing the button.
  let lastScroll = -1, stablePolls = 0
  await expect.poll(async () => {
    const current = await page.evaluate(() => scrollY)
    stablePolls = current === lastScroll ? stablePolls + 1 : 0
    lastScroll = current
    return stablePolls
  }, { intervals: [100] }).toBeGreaterThanOrEqual(3)
  await reset.tap()
  await expect(reset).toHaveCount(0)
  await expect.poll(async () => Math.abs((await svg.boundingBox())!.width - before!.width)).toBeLessThan(1)
  await context.close()
})

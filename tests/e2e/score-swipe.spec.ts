import { expect, test } from '@playwright/test'

// Real touch input verifies that browser panning does not swallow navigation.
test('single-finger swipes navigate while pinch, scroll and controls keep their behavior', async ({ browser, browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'Uses Chromium touch input')
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.goto('/scores/huan_le_song_01')
  const paper = page.locator('.score-paper')
  const ready = async () => {
    await expect(paper.locator('svg').first()).toBeVisible()
    await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  }
  await ready()
  const original = page.url()
  const next = await page.getByRole('link', { name: '下一曲', exact: true }).getAttribute('href')
  const session = await context.newCDPSession(page)
  const swipe = async (from: number, to: number, y?: number, endY?: number) => {
    const bounds = await paper.boundingBox()
    y ??= Math.max(150, Math.min(400, bounds!.y + 70))
    endY ??= y
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y, id: 1 }] })
    for (let i = 1; i <= 6; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + (to - from) * i / 6, y: y + (endY - y) * i / 6, id: 1 }] })
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await swipe(300, 90)
  await expect(page).toHaveURL(new RegExp(`${next}$`))
  await ready()
  await swipe(90, 300)
  await expect(page).toHaveURL(original)
  await ready()

  await page.getByRole('button', { name: '乐谱设置', exact: true }).tap()
  const settings = page.getByRole('dialog', { name: '乐谱设置', exact: true })
  await expect(settings).toBeVisible()
  const slider = settings.locator('input[type="range"]').first()
  const sliderBounds = await slider.boundingBox()
  await swipe(sliderBounds!.x + sliderBounds!.width - 10, sliderBounds!.x + 10, sliderBounds!.y + sliderBounds!.height / 2)
  expect(page.url()).toBe(original)
  await page.getByRole('button', { name: '关闭乐谱设置' }).tap()
  // A vertical gesture cancels navigation.
  await swipe(200, 180, 400, 280)
  expect(page.url()).toBe(original)
  let lastScroll = -1, stablePolls = 0
  await expect.poll(async () => {
    const current = await page.evaluate(() => scrollY)
    stablePolls = current === lastScroll ? stablePolls + 1 : 0
    lastScroll = current
    return stablePolls
  }, { intervals: [100] }).toBeGreaterThanOrEqual(3)
  await page.evaluate(() => window.scrollTo(0, 0))

  const bounds = await paper.boundingBox()
  const y = bounds!.y + 80
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 140, y, id: 1 }, { x: 240, y, id: 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 50, y, id: 1 }, { x: 330, y, id: 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('button', { name: '恢复原始大小' })).toBeVisible()
  expect(page.url()).toBe(original)
  const before = await paper.evaluate(element => element.scrollLeft)
  await swipe(before > 0 ? 90 : 300, before > 0 ? 300 : 90)
  expect(page.url()).toBe(original)
  await expect.poll(() => paper.evaluate(element => element.scrollLeft)).not.toBe(before)
  await context.close()
})

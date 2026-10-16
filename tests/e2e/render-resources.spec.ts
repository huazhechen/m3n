import { expect, test } from '@playwright/test'

test('staff and numbered rendering use only same-origin resources across switches', async ({ page }, testInfo) => {
  const external: string[] = []
  const requests: string[] = []
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (/^https?:$/.test(url.protocol) && url.origin !== 'http://127.0.0.1:4173') {
      external.push(url.href)
      await route.abort()
      return
    }
    requests.push(url.pathname)
    await route.continue()
  })
  const started = Date.now()
  await page.goto('/scores/huan_le_song_01')
  const paper = page.locator('.score-paper')
  await expect(paper.locator('svg').first()).toBeVisible({ timeout: 30_000 })
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  const coldStaffMs = Date.now() - started
  const timings: number[] = []
  for (const [index, enabled] of [true, false, true, false].entries()) {
    const before = Date.now()
    await page.getByRole('radio', { name: enabled ? '简谱' : '五线谱', exact: true }).check()
    await expect(paper).toHaveAttribute('data-notation', enabled ? 'numbered' : 'staff')
    await expect(paper).not.toHaveAttribute('aria-busy', 'true')
    await expect(paper.locator('svg').first()).toBeVisible()
    timings.push(Date.now() - before)
    if (index > 0) await expect(paper).toHaveAttribute('data-render-cache', 'hit')
  }
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(paper.locator('.is-playing').first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  expect(external).toEqual([])
  const libraryRequests = requests.filter(path => /verovio-score-/.test(path))
  expect(libraryRequests).toHaveLength(1)
  const wasmRequests = requests.filter(path => /\.wasm$/.test(path))
  expect(wasmRequests).toHaveLength(1)
  expect(wasmRequests[0]).toMatch(/^\/assets\/verovio-module-[\w-]+\.wasm$/)
  const report = { coldStaffMs, switchMs: timings, libraryRequests, wasmRequests, external }
  await testInfo.attach('render-resource-audit', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
  console.log('Render resource audit:', JSON.stringify(report))
})

test('documentation switches preserve existing score instances', async ({ page }, testInfo) => {
  await page.goto('/docs?doc=guide')
  const papers = page.locator('.embedded-editor .score-paper')
  await expect(papers.first().locator('svg').first()).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => papers.evaluateAll(elements => elements.every(element => element.getAttribute('aria-busy') !== 'true'))).toBe(true)
  await papers.evaluateAll(elements => elements.forEach(element => element.setAttribute('data-existing-paper', '1')))
  const count = await papers.count()
  const toggle = page.getByRole('switch', { name: '简谱渲染' })
  const timings: number[] = []
  for (const enabled of [true, false]) {
    const before = Date.now()
    await toggle.setChecked(enabled)
    await expect.poll(() => papers.evaluateAll((elements, enabled) => elements.every(element => element.dataset.notation === (enabled ? 'numbered' : 'staff') && element.getAttribute('aria-busy') !== 'true' && Boolean(element.querySelector('svg[data-engine="jpfun"]')) === enabled), enabled)).toBe(true)
    timings.push(Date.now() - before)
    await expect(papers).toHaveCount(count)
  }
  const retained = await page.locator('.embedded-editor .score-paper[data-existing-paper="1"]').count()
  console.log('Documentation switch audit:', JSON.stringify({ count, retained, timings }))
  await testInfo.attach('documentation-switch-audit', { body: JSON.stringify({ count, retained, timings }), contentType: 'application/json' })
  expect(retained).toBe(count)
})

test('editing the score and changing width invalidate both notation snapshots', async ({ page }) => {
  await page.goto('/editor')
  const editor = page.getByLabel('M3N source')
  const paper = page.locator('.score-paper')
  const toggle = page.getByRole('radio', { name: '简谱', exact: true })
  await editor.fill('{title=原谱} {4/4}\nN: 1 2 3 4 |||')
  await expect(paper.locator('svg').first()).toBeVisible({ timeout: 30_000 })
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await toggle.check()
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await page.getByRole('radio', { name: '五线谱', exact: true }).check()
  await expect(paper).toHaveAttribute('data-render-cache', 'hit')
  await toggle.check()
  await expect(paper).toHaveAttribute('data-render-cache', 'hit')
  await editor.fill('{title=改谱} {4/4}\nN: 5 6 7 1e |||')
  await expect(paper).toContainText('改谱')
  await expect(paper).toHaveAttribute('data-render-cache', 'miss')
  await page.getByRole('radio', { name: '五线谱', exact: true }).check()
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await expect(paper).toHaveAttribute('data-render-cache', 'miss')
  await expect(paper).toContainText('改谱')
  await page.getByRole('button', { name: '排版设置', exact: true }).click()
  await page.getByRole('slider', { name: '乐谱宽度' }).fill('600')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await expect(paper).toHaveAttribute('data-render-cache', 'miss')
  await toggle.check()
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await expect(paper).toHaveAttribute('data-render-cache', 'miss')
  await expect(paper).toHaveAttribute('data-notation', 'numbered')
  await expect(paper.locator('svg[data-engine="jpfun"]')).toHaveAttribute('viewBox', /^0 0 600 /)
})

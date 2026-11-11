import { expect, test, type Locator } from '@playwright/test'

async function expectUsableControls(bar: Locator) {
  const issues = await bar.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const targets = [...new Set([...element.querySelectorAll<HTMLElement>('button, input')].map(control =>
      control.matches('input[type="radio"], input[type="checkbox"], input[role="switch"]') ? control.closest('label')! : control,
    ))].filter(control => control.checkVisibility())
    const issues: string[] = []
    for (const [index, control] of targets.entries()) {
      const box = control.getBoundingClientRect()
      const name = control.getAttribute('aria-label') ?? control.textContent?.trim()
      if (box.width < 43 || box.height < 43) issues.push(`${name}: touch target ${box.width} × ${box.height}`)
      if (box.left < bounds.left - 1 || box.right > bounds.right + 1) issues.push(`${name}: outside control bar`)
      for (const other of targets.slice(index + 1)) {
        const next = other.getBoundingClientRect()
        if (Math.min(box.right, next.right) - Math.max(box.left, next.left) > 1
          && Math.min(box.bottom, next.bottom) - Math.max(box.top, next.top) > 1) {
          issues.push(`${name}: overlaps ${other.getAttribute('aria-label') ?? other.textContent?.trim()}`)
        }
      }
    }
    return issues
  })
  expect(issues).toEqual([])
}

test('reader controls stay usable from narrow phones to desktop, collapsed and expanded', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('m3n:numbered-notation', '1'))
  await page.goto('/scores/andy_01')
  const bar = page.getByRole('group', { name: '乐谱控制', exact: true })
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible()
  for (const width of [320, 360, 390, 600, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await expectUsableControls(bar)
    const practice = bar.getByRole('button', { name: '练习设置', exact: true })
    await practice.click()
    await expect(practice).toHaveAttribute('aria-expanded', 'true')
    await expectUsableControls(bar)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 390 || width === 1280) {
      const path = testInfo.outputPath(`controls-${width}.png`)
      await bar.screenshot({ path })
      await testInfo.attach(`controls-${width}`, { path, contentType: 'image/png' })
    }
    await practice.click()
    if (width === 390) await page.screenshot({ path: testInfo.outputPath('reader-mobile.png') })
  }
})

test('editor and embedded documentation controls fit their own narrow containers', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('m3n:numbered-notation', '1'))
  for (const route of ['/editor', '/docs?doc=guide']) {
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto(route)
    if (route === '/editor') await page.getByRole('tab', { name: '预览', exact: true }).click()
    const bar = page.getByRole('group', { name: '乐谱控制', exact: true }).first()
    await expect(bar.getByRole('button', { name: '播放', exact: true })).toBeVisible()
    await expectUsableControls(bar)
    await bar.getByRole('button', { name: '练习设置', exact: true }).click()
    await expectUsableControls(bar)
    await page.setViewportSize({ width: 1280, height: 900 })
    await expectUsableControls(bar)
  }
})

test('mobile practice settings persist and reset without changing score layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.setItem('m3n:numbered-notation', '1'))
  await page.goto('/scores/andy_01')
  const bar = page.getByRole('group', { name: '乐谱控制', exact: true })
  const practice = bar.getByRole('button', { name: '练习设置', exact: true })
  const speed = bar.getByRole('slider', { name: '播放速度' })
  const transpose = bar.getByRole('group', { name: '播放移调', exact: true }).locator('output')
  await expect(practice).toHaveAttribute('aria-expanded', 'false')
  await expect(speed).not.toBeVisible()
  await practice.click()
  await speed.fill('80')
  await expect(speed).toHaveValue('80')
  await bar.getByRole('button', { name: '0.75×', exact: true }).click()
  await expect(speed).toHaveValue('75')
  await bar.getByRole('button', { name: '升高半音' }).click({ clickCount: 2 })
  await expect(transpose).toHaveText('+2')
  await bar.getByRole('switch', { name: '节拍器' }).check()
  await practice.click()
  await expect(speed).not.toBeVisible()
  await page.reload()
  await practice.click()
  await expect(speed).toHaveValue('75')
  await expect(transpose).toHaveText('+2')
  await expect(bar.getByRole('switch', { name: '节拍器' })).toBeChecked()
  await bar.getByRole('button', { name: '恢复默认' }).click()
  await expect(speed).toHaveValue('100')
  await expect(transpose).toHaveText('原调')
  await expect(bar.getByRole('switch', { name: '节拍器' })).not.toBeChecked()
  await expect(page.locator('.score-paper')).toHaveAttribute('data-notation', 'numbered')
  await expect(page.locator('.score-paper')).toHaveAttribute('data-render-mode', 'continuous')
  await bar.getByRole('button', { name: '排版设置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '排版设置' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('switch', { name: '分页', exact: true }).check()
  await dialog.getByRole('switch', { name: '分页', exact: true }).uncheck()
  await dialog.getByRole('button', { name: '关闭' }).click()
  await expect(page.locator('.score-paper')).toHaveAttribute('data-render-mode', 'continuous')
  await bar.getByRole('radio', { name: '五线谱', exact: true }).check()
  await expect(page.locator('.score-paper')).toHaveAttribute('data-notation', 'staff')
  await bar.getByRole('radio', { name: '五线谱', exact: true }).press('ArrowLeft')
  await expect(bar.getByRole('radio', { name: '简谱', exact: true })).toBeChecked()
  await expect(page.locator('.score-paper')).toHaveAttribute('data-notation', 'numbered')
})

test('returning to the beginning stops playback and clears the cursor without initializing audio early', async ({ page }) => {
  const resources: string[] = []
  page.on('request', request => resources.push(request.url()))
  await page.addInitScript(() => localStorage.setItem('m3n:numbered-notation', '1'))
  await page.goto('/scores/andy_01')
  const bar = page.getByRole('group', { name: '乐谱控制', exact: true })
  const restart = bar.getByRole('button', { name: '回到开头' })
  await restart.click()
  expect(resources.filter(url => /verovio-score-|\.wasm(?:\?|$)|spessa-player-|soundfonts\//.test(url))).toEqual([])
  await bar.getByRole('button', { name: '播放', exact: true }).click()
  await expect(bar.getByRole('button', { name: '暂停', exact: true })).toBeVisible({ timeout: 30_000 })
  const position = bar.getByRole('slider', { name: '播放位置' })
  await expect.poll(() => position.inputValue()).not.toBe('0')
  await restart.click()
  await expect(position).toHaveValue('0')
  await expect(bar.getByRole('button', { name: '播放', exact: true })).toBeEnabled()
  await expect(page.locator('.score-paper .is-playing, .score-paper .is-playing-measure')).toHaveCount(0)
  await bar.getByRole('button', { name: '播放', exact: true }).click()
  await expect.poll(() => position.inputValue()).not.toBe('0')
  await bar.getByRole('button', { name: '暂停', exact: true }).click()
})

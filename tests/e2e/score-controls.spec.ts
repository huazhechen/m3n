import { expect, test, type Locator } from '@playwright/test'

async function expectUsableControls(root: Locator) {
  const issues = await root.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const targets = [...new Set([...element.querySelectorAll<HTMLElement>('button, input, select')]
      .filter(control => element.matches('dialog') || !control.closest('dialog'))
      .map(control => control.matches('input[type="radio"], input[type="checkbox"], input[role="switch"]') ? control.closest('label')! : control))]
      .filter(control => control.checkVisibility())
    const issues: string[] = []
    for (const [index, control] of targets.entries()) {
      const box = control.getBoundingClientRect()
      const name = control.getAttribute('aria-label') ?? control.textContent?.trim()
      if (box.width < 43 || box.height < 43) issues.push(`${name}: touch target ${box.width} × ${box.height}`)
      if (box.left < bounds.left - 1 || box.right > bounds.right + 1) issues.push(`${name}: outside controls`)
      for (const other of targets.slice(index + 1)) {
        const next = other.getBoundingClientRect()
        if (Math.min(box.right, next.right) - Math.max(box.left, next.left) > 1
          && Math.min(box.bottom, next.bottom) - Math.max(box.top, next.top) > 1) issues.push(`${name}: overlaps another control`)
      }
    }
    return issues
  })
  expect(issues).toEqual([])
}

test('playback dialog stays usable from narrow phones to desktop and closes with Escape', async ({ page }, testInfo) => {
  await page.goto('/scores/huan_le_song_01')
  const bar = page.getByRole('group', { name: '乐谱控制', exact: true })
  const settings = page.getByRole('button', { name: '播放设置', exact: true })
  const dialog = page.getByRole('dialog', { name: '播放设置' })
  await expect(settings).toBeVisible()
  for (const width of [320, 360, 390, 600, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await expectUsableControls(bar)
    await settings.click()
    await expect(dialog).toBeVisible()
    await expectUsableControls(dialog)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 390 || width === 1280) await dialog.screenshot({ path: testInfo.outputPath(`playback-settings-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(settings).toBeFocused()
  }
})

test('editor and embedded documentation open playback dialogs in narrow containers', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  for (const route of ['/editor', '/docs?doc=guide']) {
    await page.goto(route)
    if (route === '/editor') await page.getByRole('tab', { name: '预览', exact: true }).click()
    const bar = page.getByRole('group', { name: '乐谱控制', exact: true }).first()
    await expect(bar.getByRole('button', { name: '播放设置', exact: true })).toBeVisible()
    await expectUsableControls(bar)
    await bar.getByRole('button', { name: '播放设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '播放设置' })
    await expect(dialog).toBeVisible()
    await expectUsableControls(dialog)
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  }
})

test('BPM accepts all integers from 10 to 240, persists, and resets with the other settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/scores/huan_le_song_01')
  const settings = page.getByRole('button', { name: '播放设置', exact: true })
  const dialog = page.getByRole('dialog', { name: '播放设置' })
  const bpm = dialog.getByRole('spinbutton', { name: '播放速度（BPM）' })
  const speed = dialog.getByRole('slider', { name: '播放速度', exact: true })
  const transpose = dialog.getByRole('group', { name: '播放移调', exact: true }).locator('output')
  await settings.click()
  const original = await bpm.inputValue()
  for (const value of ['10', '240', '137']) {
    await bpm.fill(value)
    await expect(speed).toHaveValue(value)
  }
  await bpm.fill('')
  await bpm.pressSequentially('139')
  await expect(speed).toHaveValue('139')
  await bpm.fill('999')
  await bpm.press('Tab')
  await expect(bpm).toHaveValue('240')
  await speed.fill('137')
  await expect(bpm).toHaveValue('137')
  await dialog.getByRole('button', { name: '升高半音' }).click({ clickCount: 2 })
  await dialog.getByRole('switch', { name: '节拍器' }).check()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await page.reload()
  await settings.click()
  await expect(bpm).toHaveValue('137')
  await expect(transpose).toHaveText('+2')
  await expect(dialog.getByRole('switch', { name: '节拍器' })).toBeChecked()
  await dialog.getByRole('button', { name: '恢复默认' }).click()
  await expect(bpm).toHaveValue(original)
  await expect(transpose).toHaveText('原调')
  await expect(dialog.getByRole('switch', { name: '节拍器' })).not.toBeChecked()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.locator('.score-paper')).toHaveAttribute('data-render-mode', 'continuous')
  await page.getByRole('button', { name: '排版设置', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '排版设置' })).toBeVisible()
})

test('absolute BPM controls actual playback beyond the old 200 percent limit', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill('{4/4}{60qpm}\nN: 1 2 3 4 | 5 6 7 1e |||')
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  await page.getByRole('button', { name: '播放设置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '播放设置' })
  await expect(dialog.getByRole('spinbutton', { name: '播放速度（BPM）' })).toHaveValue('60')
  await dialog.getByRole('spinbutton', { name: '播放速度（BPM）' }).fill('240')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible({ timeout: 30_000 })
  // Eight quarter notes at 240 BPM take two seconds; the former 2x cap took four.
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible({ timeout: 3500 })
})

test('returning to the beginning stops playback without loading audio early', async ({ page }) => {
  const resources: string[] = []
  page.on('request', request => resources.push(request.url()))
  await page.goto('/scores/huan_le_song_01')
  const bar = page.getByRole('group', { name: '乐谱控制', exact: true })
  const restart = bar.getByRole('button', { name: '回到开头' })
  await restart.click()
  expect(resources.filter(url => /playback-score-|\.wasm(?:\?|$)|spessa-player-|\.sf3$/.test(url))).toEqual([])
  await bar.getByRole('button', { name: '播放', exact: true }).click()
  await expect(bar.getByRole('button', { name: '暂停', exact: true })).toBeVisible({ timeout: 30_000 })
  const position = bar.getByRole('slider', { name: '播放位置' })
  await expect.poll(() => position.inputValue()).not.toBe('0')
  await restart.click()
  await expect(position).toHaveValue('0')
  await expect(bar.getByRole('button', { name: '播放', exact: true })).toBeEnabled()
  await expect(page.locator('.score-paper .is-playing, .score-paper .is-playing-measure')).toHaveCount(0)
})

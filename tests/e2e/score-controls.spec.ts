import { expect, test } from '@playwright/test'

test('three aligned rows keep the same layout on phones and desktop', async ({ page }, info) => {
  await page.goto('/scores/huan_le_song_01')
  const bar = page.getByRole('group', { name: '乐谱控制', exact: true })
  await expect(bar).toBeVisible()
  for (const width of [320, 360, 390, 600, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    const geometry = await bar.evaluate(element => {
      const rows = [...element.querySelectorAll('.control-slider-row')]
      const columns = rows.map(row => [...row.children].map(child => {
        const b = child.getBoundingClientRect(); return { x: b.x, center: b.y + b.height / 2, width: b.width }
      }))
      const bounds = element.getBoundingClientRect()
      const outside = [...element.querySelectorAll('button,input')].some(control => { const b = control.getBoundingClientRect(); return b.left < bounds.left || b.right > bounds.right })
      const left = element.querySelector('.control-sliders')!.getBoundingClientRect()
      const right = element.querySelector('.control-options')!.getBoundingClientRect()
      return { columns, outside, alongside: right.left >= left.right && Math.abs(left.top - right.top) < 1 }
    })
    expect(geometry.outside).toBe(false)
    expect(geometry.alongside).toBe(true)
    for (const row of geometry.columns) for (let col = 0; col < 3; col++) {
      expect(Math.abs(row[col]!.x - geometry.columns[0]![col]!.x)).toBeLessThan(1)
      expect(Math.abs(row[col]!.center - row[0]!.center)).toBeLessThan(1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if ([390, 1280].includes(width)) await bar.screenshot({ path: info.outputPath(`controls-${width}.png`) })
  }
})

test('BPM and switches persist; speed reset leaves other settings intact', async ({ page }) => {
  await page.goto('/scores/huan_le_song_01')
  const bpm = page.getByRole('spinbutton', { name: '播放速度（BPM）' })
  const speed = page.getByRole('slider', { name: '播放速度', exact: true })
  const original = await bpm.inputValue()
  for (const value of ['10', '240', '137']) { await bpm.fill(value); await expect(speed).toHaveValue(value) }
  await bpm.fill(''); await bpm.pressSequentially('139'); await expect(speed).toHaveValue('139')
  await bpm.fill('999'); await bpm.press('Tab'); await expect(bpm).toHaveValue('240')
  await speed.fill('137')
  await page.getByRole('button', { name: '升高半音' }).click({ clickCount: 2 })
  await page.getByRole('switch', { name: '节拍器' }).click()
  await page.getByRole('switch', { name: '小节号', exact: true }).click()
  await expect(page.locator('.score-paper')).toHaveAttribute('data-measure-numbers', 'true')
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  expect(await page.locator('.score-paper text[font-size="10"]').count()).toBeGreaterThan(0)
  await page.reload()
  await expect(bpm).toHaveValue('137')
  for (const name of ['节拍器', '小节号']) await expect(page.getByRole('switch', { name, exact: true })).toBeChecked()
  await page.getByRole('button', { name: '还原速度' }).click()
  await expect(bpm).toHaveValue(original)
  await expect(page.getByRole('group', { name: '播放移调' }).locator('output')).toHaveText('+2')
  await expect(page.getByRole('switch', { name: '节拍器' })).toBeChecked()
  await page.getByRole('switch', { name: '小节号', exact: true }).click()
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('.score-paper text[font-size="10"]')).toHaveCount(0)
})

test('width resets to final scorebook widths, including non-round widths', async ({ page }) => {
  for (const [slug, width] of [['huan_le_song_01', '640'], ['ban_yin_jie_kou_qin_ji_ben_gong_01', '792']]) {
    await page.goto(`/scores/${slug}`)
    const slider = page.getByRole('slider', { name: '乐谱宽度' })
    await slider.fill('1000')
    await page.getByRole('button', { name: '还原宽度' }).click()
    await expect(slider).toHaveValue(width!)
    await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('.score-paper svg').first()).toHaveAttribute('width', width!)
    await page.reload()
    await expect(slider).toHaveValue(width!)
  }
  await page.goto('/editor')
  await page.getByRole('button', { name: '还原宽度' }).click()
  await expect(page.getByRole('slider', { name: '乐谱宽度' })).toHaveValue('780')
})

test('BPM controls actual playback; measure number changes preserve the player', async ({ page }) => {
  const resources: string[] = []
  page.on('request', request => resources.push(request.url()))
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill('{4/4}{60qpm}\nN: 1 2 3 4 | 5 6 7 1e |||')
  await expect(page.getByRole('spinbutton', { name: '播放速度（BPM）' })).toHaveValue('60')
  expect(resources.filter(url => /\.sf3$|\.wasm$/.test(url))).toHaveLength(0)
  await page.getByRole('spinbutton', { name: '播放速度（BPM）' }).fill('240')
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('switch', { name: '小节号', exact: true }).click()
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible({ timeout: 3500 })
  expect(resources.filter(url => /\.sf3$/.test(url))).toHaveLength(0)
})

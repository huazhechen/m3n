import { expect, test } from '@playwright/test'

test('synth downloads no soundfont; piano persists and plays from cache after reload', async ({ page }) => {
  const samples: string[] = []
  page.on('request', request => { if (/\.sf3(?:\?|$)/.test(request.url())) samples.push(request.url()) })
  await page.goto('/scores/huan_le_song_01')
  const tone = page.getByRole('switch', { name: '钢琴音色' })
  const play = page.getByRole('button', { name: '播放', exact: true })
  const pause = page.getByRole('button', { name: '暂停', exact: true })
  await expect(tone).not.toBeChecked()
  await play.click(); await expect(pause).toBeVisible({ timeout: 30_000 })
  expect(samples).toHaveLength(0)
  await tone.click()
  await expect(pause).toBeEnabled()
  await expect.poll(() => samples.length).toBe(1)
  await expect.poll(async () => page.evaluate(async () => (await (await caches.open('m3n-soundfonts-v1')).keys()).length)).toBe(1)
  await pause.click()
  await page.route('**/*.sf3', route => route.abort())
  await page.reload()
  await expect(tone).toBeChecked()
  await play.click(); await expect(pause).toBeVisible({ timeout: 30_000 })
  expect(samples).toHaveLength(1)
  await pause.click(); await tone.click(); await page.reload()
  await expect(tone).not.toBeChecked()
})

test('failed piano download can retry and switching to synth cancels waiting', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/scores/huan_le_song_01')
  const tone = page.getByRole('switch', { name: '钢琴音色' })
  await page.route('**/*Piano-*.sf3', route => route.fulfill({ status: 503, body: 'unavailable' }))
  await tone.click()
  await expect(page.getByRole('status').filter({ hasText: '无法下载钢琴音色' })).toBeVisible()
  await page.unroute('**/*Piano-*.sf3')
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/*Piano-*.sf3', async route => { await gate; await route.continue() })
  await page.getByRole('button', { name: '重试加载音色' }).click()
  await expect(page.getByRole('status').filter({ hasText: '正在下载钢琴音色' })).toBeVisible()
  await expect(tone).toHaveAttribute('aria-busy', 'true')
  await expect(tone).not.toBeChecked()
  await expect(tone).toContainText('加载中')
  await expect(tone.locator('.tone-loading-spinner')).toBeVisible()
  await page.locator('.audio-controls').screenshot({ path: info.outputPath('piano-loading-mobile.png') })
  await tone.click()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeEnabled({ timeout: 30_000 })
  release()
  await expect(tone).not.toBeChecked()
})

test('old harmonica preferences fall back to synth without a download', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('m3n:playback-tone', 'harmonica'))
  const samples: string[] = []
  page.on('request', request => { if (/\.sf3/.test(request.url())) samples.push(request.url()) })
  await page.goto('/scores/huan_le_song_01')
  await expect(page.getByRole('switch', { name: '钢琴音色' })).not.toBeChecked()
  expect(samples).toHaveLength(0)
})

test('transpose and delayed tone downloads keep the same audio clock playing', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeContext = window.AudioContext
    const audit = { created: 0, closed: 0 }
    Object.assign(window, { playbackAudit: audit })
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) { super(options); audit.created++ }
      override close() { audit.closed++; return super.close() }
    }
  })
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(`{4/4}{60qpm}\nN: ${'1 2 3 4 | '.repeat(16)}||`)
  const progress = page.getByRole('slider', { name: '播放位置' })
  const pause = page.getByRole('button', { name: '暂停', exact: true })
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(pause).toBeEnabled({ timeout: 30_000 })
  await expect.poll(async () => Number(await progress.inputValue())).toBeGreaterThan(5)
  const before = Number(await progress.inputValue())
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/*Piano-*.sf3', async route => { await gate; await route.continue() })
  const tone = page.getByRole('switch', { name: '钢琴音色' })
  await tone.click()
  await expect(page.getByRole('status').filter({ hasText: '正在下载钢琴音色' })).toBeVisible()
  await expect(tone).toHaveAttribute('aria-busy', 'true')
  await expect(tone).not.toBeChecked()
  await expect(tone).toContainText('加载中')
  await expect(tone.locator('.tone-loading-spinner')).toBeVisible()
  await expect(pause).toBeEnabled()
  await page.getByRole('button', { name: /^移调，当前/ }).click()
  await page.getByRole('dialog', { name: '选择调性' }).getByRole('button', { name: 'D大调', exact: true }).click()
  await expect(page.getByRole('button', { name: '移调，当前D调' })).toBeVisible()
  await expect.poll(async () => Number(await progress.inputValue())).toBeGreaterThan(before + 10)
  release()
  await expect(page.locator('.control-tone-status')).toHaveCount(0)
  await expect(tone).toBeChecked()
  await expect(tone).not.toHaveAttribute('aria-busy', 'true')
  await expect(pause).toBeEnabled()
  await tone.click()
  await expect.poll(async () => Number(await progress.inputValue())).toBeGreaterThan(before + 15)
  expect(await page.evaluate(() => (window as Window & { playbackAudit?: object }).playbackAudit)).toEqual({ created: 1, closed: 0 })
  await pause.click()
})

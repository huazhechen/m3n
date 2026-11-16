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

test('failed piano download can retry and switching to synth cancels waiting', async ({ page }) => {
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

import { expect, test, type Page } from '@playwright/test'
import { openScoreSettings } from './score-settings'

async function selectTone(page: Page, label: string) {
  await openScoreSettings(page)
  await page.getByRole('button', { name: /^选择音色，当前/ }).click()
  await page.getByRole('dialog', { name: '选择音色', exact: true }).getByRole('button', { name: label, exact: true }).click()
}
async function ready(page: Page) {
  await expect(page.locator('.playback-loading-dialog')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.locator('.control-tone-status')).toHaveCount(0)
}

test('default needs no generation; all five instruments generate locally and persist', async ({ page }, info) => {
  const samples: string[] = [], workers: string[] = []
  page.on('request', request => {
    if (/\.sf[23](?:\?|$)/.test(request.url())) samples.push(request.url())
    if (/tone-generation\.worker-.*\.js/.test(request.url())) workers.push(request.url())
  })
  await page.goto('/scores/huan_le_song_01')
  await openScoreSettings(page)
  await expect(page.getByRole('button', { name: '选择音色，当前合成音色', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible({ timeout: 30_000 })
  expect(workers).toHaveLength(0)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  const timings: Record<string, number> = {}
  for (const label of ['钢琴', '口琴', '钢弦吉他', '小提琴', '长笛']) {
    const start = Date.now()
    await selectTone(page, label)
    await ready(page)
    timings[label] = Date.now() - start
    await openScoreSettings(page)
    await expect(page.getByRole('button', { name: `选择音色，当前${label}`, exact: true })).toBeVisible()
    await page.getByRole('button', { name: '播放', exact: true }).click()
    await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '暂停', exact: true }).click()
  }
  expect(samples).toHaveLength(0)
  await expect.poll(() => page.evaluate(async () => (await (await caches.open('m3n-generated-tones-v3')).keys()).length)).toBe(5)
  const before = workers.length
  await page.reload(); await ready(page)
  await openScoreSettings(page)
  await expect(page.getByRole('button', { name: '选择音色，当前长笛', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  expect(workers).toHaveLength(before)
  await info.attach('local-generation-ms.json', { body: JSON.stringify(timings), contentType: 'application/json' })
})

test('generation has real progress, cancellation and retry on a narrow screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/scores/huan_le_song_01')
  // Hold the worker module before any samples can be generated.
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/*tone-generation.worker-*.js', async route => { await gate; await route.continue().catch(() => {}) })
  await selectTone(page, '钢琴')
  const dialog = page.getByRole('dialog', { name: '生成钢琴音色', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('progressbar', { name: '音色生成进度' })).toHaveAttribute('value', '0')
  await dialog.screenshot({ path: info.outputPath('tone-generation-mobile.png') })
  await dialog.getByRole('button', { name: '取消生成' }).click()
  await ready(page)
  release()
  await page.unroute('**/*tone-generation.worker-*.js')
  await openScoreSettings(page)
  await expect(page.getByRole('button', { name: '选择音色，当前合成音色', exact: true })).toBeVisible()
  await page.route('**/*tone-generation.worker-*.js', route => route.abort())
  await selectTone(page, '钢琴')
  await expect(page.locator('.control-tone-status')).toContainText('无法生成音色')
  await page.unroute('**/*tone-generation.worker-*.js')
  await openScoreSettings(page)
  await page.getByRole('button', { name: '重试加载音色' }).click()
  await ready(page)
  await openScoreSettings(page)
  await expect(page.getByRole('button', { name: '选择音色，当前钢琴', exact: true })).toBeVisible()
})

test('live generation and transpose preserve the audio context and transport position', async ({ page }) => {
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
  await page.route('**/*tone-generation.worker-*.js', async route => { await gate; await route.continue() })
  await selectTone(page, '小提琴')
  await page.getByRole('button', { name: '后台加载' }).click()
  await expect(pause).toBeEnabled()
  await openScoreSettings(page)
  await page.getByRole('button', { name: /^移调，当前/ }).click()
  await page.getByRole('dialog', { name: '选择调性' }).getByRole('button', { name: 'D大调', exact: true }).click()
  await expect.poll(async () => Number(await progress.inputValue())).toBeGreaterThan(before + 10)
  release(); await ready(page)
  await selectTone(page, '合成音色'); await ready(page)
  await expect(pause).toBeEnabled()
  expect(await page.evaluate(() => (window as Window & { playbackAudit?: object }).playbackAudit)).toEqual({ created: 1, closed: 0 })
  await pause.click()
})

test('unknown stored tones use the default, while harmonica is now supported', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('m3n:playback-tone')) localStorage.setItem('m3n:playback-tone', 'unknown') })
  await page.goto('/scores/huan_le_song_01'); await openScoreSettings(page)
  await expect(page.getByRole('button', { name: '选择音色，当前合成音色', exact: true })).toBeVisible()
  await selectTone(page, '口琴'); await ready(page)
  await page.reload(); await ready(page); await openScoreSettings(page)
  await expect(page.getByRole('button', { name: '选择音色，当前口琴', exact: true })).toBeVisible()
})

test('cold playback shows a modal progress bar until the audio worklet is ready', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/*spessasynth_processor.min-*.js', async route => { await gate; await route.continue() })
  await page.goto('/scores/huan_le_song_01')
  await page.getByRole('button', { name: '播放', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '准备播放', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('progressbar', { name: '播放准备进度' })).not.toHaveAttribute('value')
  release()
  await expect(dialog).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeEnabled()
})

async function auditFinalOutput(page: Page) {
  await page.addInitScript(() => {
    const NativeNode = window.AudioWorkletNode
    const audit = { peak: 0, rms: 0, limiters: 0 }
    Object.assign(window, { loudnessAudit: audit })
    window.AudioWorkletNode = class extends NativeNode {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options)
        if (name !== 'm3n-output-limiter') return
        const analyser = context.createAnalyser()
        analyser.fftSize = 2048
        this.connect(analyser)
        const samples = new Float32Array(analyser.fftSize)
        audit.limiters++
        const timer = window.setInterval(() => {
          if (context.state === 'closed') { clearInterval(timer); return }
          analyser.getFloatTimeDomainData(samples)
          audit.peak = Math.max(audit.peak, ...samples.map(Math.abs))
          audit.rms = Math.max(audit.rms, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length))
        }, 10)
      }
    }
  })
}

test('full-volume playback stays audible and compresses dense chords without clipping', async ({ page }) => {
  await auditFinalOutput(page)
  await page.goto('/editor')
  // Six simultaneous notes expose clipping that single-note playback cannot.
  await page.getByLabel('M3N source').fill('{4/4}{120qpm}\nN: [135:h]^^ | [135:h]^^ |||\nB: [135d:h]^^ | [135d:h]^^ |||')
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeEnabled({ timeout: 30_000 })
  await expect.poll(() => page.evaluate(() => (window as Window & { loudnessAudit?: { rms: number } }).loudnessAudit!.rms), { timeout: 10_000 }).toBeGreaterThan(0.1)
  const audit = await page.evaluate(() => (window as Window & { loudnessAudit?: { peak: number; rms: number; limiters: number } }).loudnessAudit!)
  expect(audit.limiters).toBe(1)
  expect(audit.peak).toBeLessThanOrEqual(0.941)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
})

for (const label of ['合成音色', '钢琴', '钢弦吉他', '口琴', '小提琴', '长笛']) {
  test(`${label} has clear monophonic output after mastering`, async ({ page }) => {
    await auditFinalOutput(page)
    await page.goto('/editor')
    await page.getByLabel('M3N source').fill('{4/4}{60qpm}\nN: 1 - - - | 1 - - - |||')
    if (label !== '合成音色') { await selectTone(page, label); await ready(page) }
    await page.getByRole('button', { name: '播放', exact: true }).click()
    await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeEnabled({ timeout: 30_000 })
    await expect.poll(() => page.evaluate(() => (window as Window & { loudnessAudit?: { rms: number } }).loudnessAudit!.rms)).toBeGreaterThan(0.2)
    const audit = await page.evaluate(() => (window as Window & { loudnessAudit?: { peak: number; limiters: number } }).loudnessAudit!)
    expect(audit.limiters).toBe(1)
    expect(audit.peak).toBeLessThanOrEqual(0.941)
    await page.getByRole('button', { name: '暂停', exact: true }).click()
  })
}

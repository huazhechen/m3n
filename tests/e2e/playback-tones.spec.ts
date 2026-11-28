import { expect, test, type Page } from '@playwright/test'
import { openScoreSettings } from './score-settings'
import { waitForEditor } from './editor-state'

async function selectTone(page: Page, label: string) {
  await openScoreSettings(page)
  await page.getByRole('button', { name: /^选择音色，当前/ }).click()
  await page.getByRole('dialog', { name: '选择音色', exact: true }).getByRole('button', { name: label, exact: true }).click()
}
async function ready(page: Page) {
  await waitForEditor(page)
  await expect(page.locator('.playback-loading-dialog')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.locator('.control-tone-status')).toHaveCount(0)
}

test('download has progress, cancellation and retry on a narrow screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/scores/huan_le_song_01')
  // Hold the selected sample download before its response headers arrive.
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/*FluidR3-piano-q3-*.sf3', async route => { await gate; await route.continue().catch(() => {}) })
  await selectTone(page, '钢琴')
  await expect(page.locator('.playback-loading-dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '播放', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '加载钢琴音色', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('progressbar', { name: '音色下载进度' })).not.toHaveAttribute('value')
  await dialog.screenshot({ path: info.outputPath('tone-download-mobile.png') })
  await dialog.getByRole('button', { name: '取消加载' }).click()
  await ready(page)
  release()
  await page.unroute('**/*FluidR3-piano-q3-*.sf3')
  await openScoreSettings(page)
  await expect(page.getByRole('button', { name: '选择音色，当前合成', exact: true })).toBeVisible()
  await page.route('**/*FluidR3-piano-q3-*.sf3', route => route.abort())
  await selectTone(page, '钢琴')
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.locator('.control-tone-status')).toContainText('无法加载音色')
  await page.unroute('**/*FluidR3-piano-q3-*.sf3')
  await openScoreSettings(page)
  await page.getByRole('button', { name: '重试加载音色' }).click()
  await ready(page)
  await openScoreSettings(page)
  await expect(page.getByRole('button', { name: '选择音色，当前钢琴', exact: true })).toBeVisible()
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
async function startAuditedPlayback(page: Page) {
  await page.getByRole('button', { name: '播放', exact: true }).click()
  // Measure the instrument, after the audible count-in has finished.
  await expect(page.locator('.score-paper .is-playing-measure').first()).toBeAttached()
  await page.evaluate(() => {
    const audit = Reflect.get(window, 'loudnessAudit')
    audit.peak = 0; audit.rms = 0
  })
}

for (const label of ['合成', '钢琴']) {
  test(`${label} stays audible and limits dense chords after mastering`, async ({ page }) => {
    await auditFinalOutput(page)
    await page.goto('/editor')
    await waitForEditor(page)
    await page.getByLabel('M3N source').fill('{title=音频输出}{key=C}{4/4}{180qpm}\nN: 1^^ | 1^^ |||')
    await expect(page.locator('.score-paper')).toContainText('音频输出')
    await waitForEditor(page)
    await expect(page.locator('.editor-render-diagnostics')).toHaveCount(0)
    if (label !== '合成') { await selectTone(page, label); await ready(page) }
    await startAuditedPlayback(page)
    await expect.poll(() => page.evaluate(() => (window as Window & { loudnessAudit?: { rms: number } }).loudnessAudit!.rms)).toBeGreaterThan(0.005)
    const audit = await page.evaluate(() => (window as Window & { loudnessAudit?: { peak: number; limiters: number } }).loudnessAudit!)
    console.log(`${label} output`, JSON.stringify(audit))
    expect(audit.limiters).toBe(1)
    expect(audit.peak).toBeLessThanOrEqual(0.941)
    {
      // Exercise both the synthesized and sampled output paths.
      await page.getByRole('button', { name: '暂停', exact: true }).click()
      await page.getByLabel('M3N source').fill('{title=密集和弦}{key=C}{4/4}{180qpm}\nN: [1 3 5:h]^^ | [1 3 5:h]^^ |||\nB: [1d 3d 5d:h]^^ | [1d 3d 5d:h]^^ |')
      await waitForEditor(page)
      await expect(page.locator('.score-paper [data-m3n-role="voice-connector"]').first()).toBeAttached()
      await expect(page.locator('.editor-render-diagnostics')).toHaveCount(0)
      await startAuditedPlayback(page)
      await expect.poll(() => page.evaluate(() => Reflect.get(window, 'loudnessAudit').rms)).toBeGreaterThan(0.005)
      await page.waitForTimeout(1500)
      const dense = await page.evaluate(() => Reflect.get(window, 'loudnessAudit'))
      console.log(`${label} dense output`, JSON.stringify(dense))
      expect(dense.peak).toBeLessThanOrEqual(0.941)
      await page.getByRole('button', { name: '暂停', exact: true }).click()
    }
  })
}
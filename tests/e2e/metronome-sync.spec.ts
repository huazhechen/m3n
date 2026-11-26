import { expect, test } from '@playwright/test'
import { openScoreSettings } from './score-settings'
import { waitForEditor } from './editor-state'

test.afterEach(async ({ page }, info) => {
  const trace = await page.evaluate(() => (window as any).m3nAudioTrace).catch(() => null)
  if (trace) console.log('AUDIO_TRACE', JSON.stringify(trace))
  if (trace) await info.attach('raw-audio-trace', { body: JSON.stringify(trace, null, 2), contentType: 'application/json' })
})

test('metronome remains on the MIDI audio beat after forward/backward slider seeks and rate changes', async ({ page }, info) => {
  await page.addInitScript(() => {
    type Trace = {
      acks: { time: number; audio: number; received: number }[]
      clicks: { at: number; created: number }[]
    }
    const trace: Trace = { acks: [], clicks: [] }
    Object.assign(window, { m3nAudioTrace: trace })
    let audioOrigin: number | undefined
    const Worklet = window.AudioWorkletNode
    window.AudioWorkletNode = class extends Worklet {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options)
        this.port.addEventListener('message', event => {
          const message = event.data
          if (message.type === 'sequencerReturn' && message.data?.type === 'timeChange') {
            // SpessaSynth's processor counter starts when its worklet is
            // created, after the AudioContext clock has already advanced.
            audioOrigin ??= context.currentTime - message.currentTime
            trace.acks.push({ time: message.data.data.newTime, audio: message.currentTime + audioOrigin, received: context.currentTime })
          }
        })
      }
    }
    const create = AudioContext.prototype.createOscillator
    AudioContext.prototype.createOscillator = function () {
      const oscillator = create.call(this), start = oscillator.start
      oscillator.start = (at = 0) => {
        trace.clicks.push({ at, created: this.currentTime })
        start.call(oscillator, at)
      }
      return oscillator
    }
  })
  await page.goto('/editor')
  await waitForEditor(page)
  await page.getByLabel('M3N source').fill('{4/4}{120qpm}\nN: ' + Array.from({ length: 8 }, () => '1 2 3 4 |').join(' ') + ' {60qpm}' + Array.from({ length: 8 }, () => '1 2 3 4 |').join(' '))
  await waitForEditor(page)
  await openScoreSettings(page)
  const metro = page.getByRole('switch', { name: '节拍器', exact: true })
  if (await metro.isChecked()) await metro.click()
  await openScoreSettings(page)
  await page.getByRole('slider', { name: '播放速度', exact: true }).fill('120')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible({ timeout: 30_000 })
  await openScoreSettings(page)
  await metro.click()
  await page.keyboard.press('Escape')
  const progress = page.getByRole('slider', { name: '播放位置', exact: true })
  const measurements = []
  for (const [value, rate] of [['453', 1], ['172', 1], ['691', 2], ['287', 2]] as const) {
    await openScoreSettings(page)
    await page.getByRole('slider', { name: '播放速度', exact: true }).fill(String(rate * 120))
    await page.keyboard.press('Escape')
    const before = await page.evaluate(() => (window as any).m3nAudioTrace.acks.length)
    await progress.dispatchEvent('pointerdown')
    await progress.fill(value)
    await page.locator('body').dispatchEvent('pointerup')
    await expect.poll(() => page.evaluate(() => (window as any).m3nAudioTrace.acks.length)).toBeGreaterThan(before)
    await expect.poll(() => page.evaluate(({ rate }) => {
      const trace = (window as any).m3nAudioTrace
      const ack = trace.acks.at(-1)
      return trace.clicks.filter((click: { at: number; created: number }) => click.created >= ack.received && click.at > ack.received + 0.015)
        .filter((click: { at: number }) => {
          const time = ack.time + (click.at - ack.audio) * rate
          const beat = time < 16 ? Math.round(time / 0.5) * 0.5 : 16 + Math.round(time - 16)
          return Math.abs(time - beat) / rate < 0.02
        }).length
    }, { rate }), { timeout: 5000 }).toBeGreaterThanOrEqual(1)
    measurements.push(await page.evaluate(({ rate }) => {
      const trace = (window as any).m3nAudioTrace, ack = trace.acks.at(-1)
      return { rate, ack, clicks: trace.clicks.filter((click: { at: number; created: number }) => click.created >= ack.received && click.at > ack.received + 0.015).map((click: { at: number }) => {
        const time = ack.time + (click.at - ack.audio) * rate
        const beat = time < 16 ? Math.round(time / 0.5) * 0.5 : 16 + Math.round(time - 16)
        return { at: click.at, beatErrorSeconds: Math.abs(time - beat) / rate }
      }) }
    }, { rate }))
    const current = measurements.at(-1)!
    // Inspect every newly scheduled click, not only the two used to await progress.
    for (const click of current.clicks) expect(click.beatErrorSeconds).toBeLessThan(0.02)
  }
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await info.attach('audio-clock-seek-trace', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' })
})

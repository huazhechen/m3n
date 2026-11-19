import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { BasicMIDI } from 'spessasynth_core'
import { openScoreSettings } from './score-settings'

for (const { width, meter, melody, bass, bpm, pitches, duration } of [
  { width: 1280, meter: '2/4', melody: '1 2 | {60qpm}3 4', bass: '1d^ | 5d^', bpm: 90, pitches: [62, 64, 66, 67], duration: 8 },
  { width: 390, meter: '6/8', melody: '1 2 3 | {60qpm}4 5 6', bass: '1d 0^ | 5d 0^', bpm: 180, pitches: [62, 64, 66, 67, 69, 71], duration: 12 },
]) test(`MIDI download uses current key and beat-based speed with both voices at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(source => {
    localStorage.setItem('m3n:local-scores', JSON.stringify([
      { id: 'local-midi-test', source, createdAt: '2026-11-19T00:00:00Z', expiresAt: null },
    ]))
  }, `{title=MIDI导出验证}{key=C}{${meter}}{120qpm}\nN: ||: ${melody} :||\nB: ${bass} |||`)
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await page.goto('/scores/local-midi-test')
  await expect(page.locator('.score-paper svg').first()).toBeVisible()
  await openScoreSettings(page)
  await page.getByRole('slider', { name: '播放速度', exact: true }).fill(String(bpm))
  await page.getByRole('button', { name: /^移调，当前/ }).click()
  await page.getByRole('dialog', { name: '选择调性' }).getByRole('button', { name: 'D大调', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '导出乐谱', exact: true })
  await expect(dialog.getByRole('group', { name: '导出格式' }).getByRole('button')).toHaveText(['PNG', 'PDF', 'MIDI'])
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'MIDI', exact: true }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('MIDI导出验证.mid')
  const path = info.outputPath(download.suggestedFilename())
  await download.saveAs(path)
  const bytes = await readFile(path)
  expect(bytes.subarray(0, 4).toString()).toBe('MThd')
  const midi = BasicMIDI.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  expect(midi.timeDivision).toBe(960)
  expect(midi.tracks).toHaveLength(3)
  expect(midi.duration).toBeCloseTo(duration, 5)
  const events = midi.tracks.flatMap(track => track.events)
  const notes = events.filter(event => (event.statusByte & 0xf0) === 0x90 && event.data[1]! > 0)
  expect(notes.filter(note => (note.statusByte & 15) === 0).map(note => note.data[0])).toEqual([...pitches, ...pitches])
  expect(notes.filter(note => (note.statusByte & 15) === 1).map(note => note.data[0])).toEqual([50, 57, 50, 57])
  const tempos = midi.tracks[0]!.events.filter(event => event.statusByte === 0x51)
    .map(event => Math.round(60_000_000 / (event.data[0]! * 65536 + event.data[1]! * 256 + event.data[2]!)))
  expect(tempos).toEqual([90, 45, 90, 45])
  expect(events.some(event => (event.statusByte & 0xf0) === 0xc0)).toBe(false)
  expect(notes.some(note => (note.statusByte & 15) === 9)).toBe(false)
  expect(requests.some(url => /spessa-player-|spessasynth_processor|\.sf[23](?:$|\?)/.test(url))).toBe(false)
  await expect(dialog).not.toBeVisible()
})

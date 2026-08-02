import { describe, expect, it } from 'vitest'
import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'
import { BasicMIDI } from 'spessasynth_core'
import { m3nToMei } from '../../lib/m3n-mei'
import { automaticSystemBreakMeasureIds, encodeSystemBreaks } from './verovio-score'
import { lyricVerseIndexForMeasureRendition, lyricVerseIndexForRendition, measureHasLaterVisibleLyrics } from './lyric-rendition'

async function renderedPitches(source: string) {
  const toolkit = new VerovioToolkit(await createVerovioModule())
  try {
    expect(toolkit.loadData(m3nToMei(source).mei)).toBe(1)
    const binary = atob(toolkit.renderToMIDI().replace(/^data:audio\/midi;base64,/, ''))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const midi = BasicMIDI.fromArrayBuffer(bytes.buffer)
    return midi.tracks.flatMap((track) => track.events
      .filter((event) => event.statusByte === 144 && event.data[1] > 0)
      .map((event) => event.data[0]))
  } finally {
    toolkit.destroy()
  }
}

describe('VerovioScore layout', () => {
  it('collects the final measure of each automatically laid-out system', () => {
    const breaks = automaticSystemBreakMeasureIds([
      '<g class="system"><g id="m3n-measure-1-1"/><g id="m3n-measure-1-2"/></g><g class="system"><g id="m3n-measure-1-3"/></g>',
    ])

    expect(breaks).toEqual(new Set(['m3n-measure-1-2', 'm3n-measure-1-3']))
  })

  it('adds automatic system breaks without duplicating encoded breaks', () => {
    const mei = '<section><measure xml:id="m3n-measure-1-1"></measure><measure xml:id="m3n-measure-1-2"></measure><sb/><measure xml:id="m3n-measure-1-3"></measure></section>'

    expect(encodeSystemBreaks(mei, new Set(['m3n-measure-1-1', 'm3n-measure-1-2']))).toBe(
      '<section><measure xml:id="m3n-measure-1-1"></measure><sb/><measure xml:id="m3n-measure-1-2"></measure><sb/><measure xml:id="m3n-measure-1-3"></measure></section>',
    )
  })

  it('maps each playback occurrence to its available lyric verse', () => {
    expect(lyricVerseIndexForRendition(1, 1)).toBe(0)
    expect(lyricVerseIndexForRendition(3, 1)).toBe(0)
    expect(lyricVerseIndexForRendition(3, 2)).toBe(1)
    expect(lyricVerseIndexForRendition(3, 3)).toBe(2)
  })

  it('reuses first-pass lyrics only when a measure has no later visible lyrics', () => {
    expect(measureHasLaterVisibleLyrics([
      { id: 'm3n-e-1-v1', textContent: 'first' },
      { id: 'm3n-e-1-v2', textContent: '\u200B' },
    ])).toBe(false)
    expect(lyricVerseIndexForMeasureRendition(2, 2, false)).toBe(0)

    expect(measureHasLaterVisibleLyrics([
      { id: 'm3n-e-1-v1', textContent: 'first' },
      { id: 'm3n-e-1-v2', textContent: 'second' },
    ])).toBe(true)
    expect(lyricVerseIndexForMeasureRendition(2, 2, true)).toBe(1)
  })

  it('uses Verovio playback expansion for endings, repeats, D.S., and D.C.', async () => {
    await expect(renderedPitches('{2/4} 1 2 | {volta=1}3 4{/} || {volta=2}5 6{/} |||'))
      .resolves.toEqual([60, 62, 64, 65, 67, 69])
    await expect(renderedPitches('{2/4} ||: 1 2 | {volta=1}3 4{/}:|| {volta=2}5 6{/} |||'))
      .resolves.toEqual([60, 62, 64, 65, 60, 62, 67, 69])
    await expect(renderedPitches('{2/4} ||: 1 2 | {volta=1}3 4{/} | {volta=2}5 6{/} | 7 1e | {volta=1}2e 3e{/} | {volta=2}4e 5e{/} | 6e 7e :|| |||'))
      .resolves.toEqual([60, 62, 64, 65, 71, 72, 74, 76, 81, 83, 60, 62, 67, 69, 71, 72, 77, 79, 81, 83])
    await expect(renderedPitches('{2/4} ||: 1 2 | {volta=1}3 4{/}:|| {volta=2~4}5 6{/}:||{x4} |||'))
      .resolves.toEqual([60, 62, 64, 65, 60, 62, 67, 69, 60, 62, 67, 69, 60, 62, 67, 69])
    await expect(renderedPitches('{2/4} {segno}1 2 | 3 4{fine} ||| 5 6{ds} ||'))
      .resolves.toEqual([60, 62, 64, 65, 67, 69, 60, 62, 64, 65])
    await expect(renderedPitches('{2/4} 1 2 | 3 4{fine} ||| 5 6{dc} ||'))
      .resolves.toEqual([60, 62, 64, 65, 67, 69, 60, 62, 64, 65])
  })
})

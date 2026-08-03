import { describe, expect, it } from 'vitest'
import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'
import { BasicMIDI } from 'spessasynth_core'
import { m3nToMei } from '../../lib/m3n-mei'
import { automaticSystemBreakMeasureIds, encodeSystemBreaks, projectEndingTieGhosts } from './verovio-score'
import { lyricVerseIndexForMeasureRendition, lyricVerseIndexForRendition, visibleLyricVerseNumbers } from './lyric-rendition'

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

  it('adds an invisible tie anchor for later matching alternate endings only in the layout projection', () => {
    const mei = m3nToMei('{2/4}\nN: ||: 1 4~ |\n---V1\nN: 4 5 :||\n---V2\nN: 4 3 |||').mei
    const layoutMei = projectEndingTieGhosts(mei)

    expect(mei).not.toContain('m3n-layout-ghost')
    expect(mei).toContain('<tie startid="#m3n-e-2" endid="#m3n-e-3"/>')
    expect(layoutMei).toContain('<graceGrp attach="post"><note xml:id="m3n-layout-ghost-1" pname="f" oct="4" dur="4" grace="unacc" visible="false"/></graceGrp>')
    expect(layoutMei).toContain('<tie startid="#m3n-layout-ghost-1" endid="#m3n-e-5"/>')
    expect(layoutMei.indexOf('m3n-layout-ghost-1')).toBeGreaterThan(layoutMei.indexOf('xml:id="m3n-ending-2"'))
  })

  it('loads the projected ghost tie in Verovio without changing canonical MIDI input', async () => {
    const source = '{2/4}\nN: ||: 1 4~ |\n---V1\nN: 4 5 :||\n---V2\nN: 4 3 |||'
    const mei = m3nToMei(source).mei
    const toolkit = new VerovioToolkit(await createVerovioModule())
    try {
      expect(mei).not.toContain('m3n-layout-ghost')
      expect(toolkit.loadData(projectEndingTieGhosts(mei))).toBe(1)
      expect(toolkit.renderToSVG(1)).toContain('class="tie')
    } finally {
      toolkit.destroy()
    }
    await expect(renderedPitches(source)).resolves.toEqual([60, 65, 67, 60, 65, 65, 64])
  })

  it('does not add a ghost tie when a later ending starts on another pitch', () => {
    const mei = m3nToMei('{2/4}\nN: ||: 1 4~ |\n---V1\nN: 4 5 :||\n---V2\nN: 3 4 |||').mei

    expect(projectEndingTieGhosts(mei)).not.toContain('m3n-layout-ghost')
  })

  it('maps each playback occurrence to its available lyric verse', () => {
    expect(lyricVerseIndexForRendition(1, 1)).toBe(0)
    expect(lyricVerseIndexForRendition(3, 1)).toBe(0)
    expect(lyricVerseIndexForRendition(3, 2)).toBe(1)
    expect(lyricVerseIndexForRendition(3, 3)).toBe(2)
  })

  it('selects the most recent visible lyric verse for a repeated measure', () => {
    expect(visibleLyricVerseNumbers([
      { id: 'm3n-e-1-v1', textContent: 'first' },
      { id: 'm3n-e-1-v2', textContent: '\u200B' },
    ])).toEqual([1])
    expect(lyricVerseIndexForMeasureRendition([{ id: 'm3n-e-1-v1' }, { id: 'm3n-e-1-v2' }], 2, [1])).toBe(0)

    expect(visibleLyricVerseNumbers([
      { id: 'm3n-e-1-v1', textContent: 'first' },
      { id: 'm3n-e-1-v2', textContent: 'second' },
      { id: 'm3n-e-1-v3', textContent: '\u200B' },
    ])).toEqual([1, 2])
    expect(lyricVerseIndexForMeasureRendition([{ id: 'm3n-e-1-v1' }, { id: 'm3n-e-1-v2' }, { id: 'm3n-e-1-v3' }], 3, [1, 2])).toBe(0)
    expect(lyricVerseIndexForMeasureRendition([{ id: 'm3n-e-1-v1' }, { id: 'm3n-e-1-v2' }, { id: 'm3n-e-1-v3' }], 4, [1, 2])).toBe(1)
    expect(lyricVerseIndexForMeasureRendition([
      { id: 'm3n-e-1-v1', classList: ['verse', 'm3n-passes-1-3'] },
      { id: 'm3n-e-1-v2', classList: ['verse'] },
      { id: 'm3n-e-1-v3', classList: ['verse'] },
    ], 3, [1, 2, 3])).toBe(0)
    expect(lyricVerseIndexForMeasureRendition([
      { id: 'm3n-e-1-v1', classList: ['verse'] },
      { id: 'm3n-e-1-v2', classList: ['verse', 'm3n-passes-2-3'] },
    ], 3, [1, 2])).toBe(1)
  })

  it('uses Verovio playback expansion for endings, repeats, D.S., and D.C.', async () => {
    await expect(renderedPitches('{2/4}\nN: 1 2 |\n---V1\nN: 3 4 ||\n---V2\nN: 5 6 |||'))
      .resolves.toEqual([60, 62, 64, 65, 67, 69])
    await expect(renderedPitches('{2/4}\nN: ||: 1 2 |\n---V1\nN: 3 4 :||\n---V2\nN: 5 6 |||'))
      .resolves.toEqual([60, 62, 64, 65, 60, 62, 67, 69])
    await expect(renderedPitches('{2/4}\nN: ||: 1 2 |\n---V1\nN: 3 4 :||\n---V2,V3,V4\nN: 5 6 :||{x4} |||'))
      .resolves.toEqual([60, 62, 64, 65, 60, 62, 67, 69, 60, 62, 67, 69, 60, 62, 67, 69])
    await expect(renderedPitches('{2/4} {segno}1 2 | 3 4{fine} ||| 5 6{ds} ||'))
      .resolves.toEqual([60, 62, 64, 65, 67, 69, 60, 62, 64, 65])
    await expect(renderedPitches('{2/4} 1 2 | 3 4{fine} ||| 5 6{dc} ||'))
      .resolves.toEqual([60, 62, 64, 65, 67, 69, 60, 62, 64, 65])
  })
})

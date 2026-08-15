import { describe, expect, it } from 'vitest' 
import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'
import { BasicMIDI } from 'spessasynth_core'
import { m3nToMei } from '@m3n/notation'
import { a4SourcePageHeight } from './score-export'
import { scoreHeaderHeight } from './score-header-svg'
import {
  automaticSystemBreakMeasureIds,
  encodeSystemBreaks,
  encodedSystemLayout,
  extraSystemBreakMeasureIds,
  naturalSystemLayout,
  pageBreakMeasureIds,
} from './verovio-score'
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
  it('renders cautionary naturals when changing from A major to C major', async () => {
    const toolkit = new VerovioToolkit(await createVerovioModule())
    try {
      expect(toolkit.loadData(m3nToMei('{key=A} {4/4}\n1 2 3 4 | {key=C}1 2 3 4 |||').mei)).toBe(1)
      expect(toolkit.renderToSVG(1)).toContain('E261')
    } finally {
      toolkit.destroy()
    }
  })

  it('renders a section label anchored to a tuplet note', async () => {
    const toolkit = new VerovioToolkit(await createVerovioModule())
    try {
      expect(toolkit.loadData(m3nToMei('{2/4}\n===A\nN: ([123:2]) |||').mei)).toBe(1)
      expect(toolkit.renderToSVG(1)).toContain('A')
    } finally {
      toolkit.destroy()
    }
  })

  it('paginates encoded system breaks when page breaks are present', async () => {
    const measures = Array.from({ length: 40 }, () => '1 2 3 4').join(' | {br}')
    const mei = m3nToMei(`{key=C} {4/4}\n${measures} |||`).mei
      .replace('<measure xml:id="m3n-measure-1-21"', '<pb/><measure xml:id="m3n-measure-1-21"')
    const toolkit = new VerovioToolkit(await createVerovioModule())
    try {
      toolkit.setOptions({
        adjustPageHeight: false,
        breaks: 'encoded',
        footer: 'none',
        header: 'none',
        pageHeight: Math.max(800, Math.round(400 * 100 / 42)),
        pageMarginTop: 8,
        pageWidth: Math.max(800, Math.round(800 * 100 / 42)),
        scale: 42,
        svgViewBox: true,
      })
      expect(toolkit.loadData(mei)).toBe(1)

      expect(toolkit.getPageCount()).toBeGreaterThan(1)
    } finally {
      toolkit.destroy()
    }
  })

  it('reads system positions and first measure ids from an encoded SVG', () => {
    const svg = '<svg><g class="system"><path d="M13 1019 L13 1739"/><g id="m3n-measure-1-1" class="measure"/></g>'
      + '<g class="system"><path d="M13 3179 L13 3899"/><g id="m3n-measure-1-3" class="measure"/></g></svg>'

    expect(encodedSystemLayout(svg)).toEqual([
      { top: 1019, bottom: 1739, firstMeasure: 'm3n-measure-1-1' },
      { top: 3179, bottom: 3899, firstMeasure: 'm3n-measure-1-3' },
    ])
  })

  it('groups encoded systems into pages by height', () => {
    const systems = [
      { top: 1019, bottom: 1739, firstMeasure: 'm3n-measure-1-1' },
      { top: 3179, bottom: 3899, firstMeasure: 'm3n-measure-1-5' },
      { top: 5339, bottom: 6059, firstMeasure: 'm3n-measure-1-9' },
    ]

    expect(pageBreakMeasureIds(systems, 7000)).toEqual([])
    expect(pageBreakMeasureIds(systems, 5000)).toEqual(['m3n-measure-1-9'])
  })

  it('reads measure extents from a non-justified encoded SVG', () => {
    const svg = '<svg><g class="system">'
      + '<g id="m3n-measure-1-1" class="measure"><use transform="translate(100, 10) scale(1)"/><path d="M400 10 L400 100"/><text x="450" y="5">x</text></g>'
      + '<g id="m3n-measure-1-2" class="measure"><use transform="translate(500, 10) scale(1)"/></g>'
      + '</g><g class="system">'
      + '<g id="m3n-measure-1-3" class="measure"><use transform="translate(700, 10) scale(1)"/></g>'
      + '</g></svg>'

    expect(naturalSystemLayout(svg)).toEqual([
      {
        measures: [
          { id: 'm3n-measure-1-1', minX: 100, maxX: 450 },
          { id: 'm3n-measure-1-2', minX: 500, maxX: 500 },
        ],
      },
      {
        measures: [{ id: 'm3n-measure-1-3', minX: 700, maxX: 700 }],
      },
    ])
  })

  it('adds extra system breaks only to over-wide forced systems', () => {
    const systems = [{
      measures: [
        { id: 'm3n-measure-1-1', minX: 0, maxX: 1000 },
        { id: 'm3n-measure-1-2', minX: 1200, maxX: 2200 },
        { id: 'm3n-measure-1-3', minX: 2400, maxX: 3400 },
      ],
    }]

    expect(extraSystemBreakMeasureIds(systems, 2000)).toEqual(['m3n-measure-1-2', 'm3n-measure-1-3'])
    expect(extraSystemBreakMeasureIds(systems, 4000)).toEqual([])
  })

  it('keeps forced systems above the justification warning ratio and justifies them', async () => {
    const dense = (value: number) => Array.from({ length: 16 }, () => value).join(' ')
    const source = `{key=C} {4/4}\n1 2 3 4 | {br}(${dense(5)}) (${dense(6)}) | (${dense(7)}) (${dense(8)}) |||`
    const result = m3nToMei(source)
    const width = 800
    const pageHeight = Math.max(1, a4SourcePageHeight(width) - scoreHeaderHeight(result.headerMetadata))
    const pageWidth = Math.max(800, Math.round(width * 100 / 42))
    const opts = {
      adjustPageHeight: false,
      footer: 'none',
      header: 'none',
      lyricTopMinMargin: 0,
      pageHeight: Math.max(800, Math.round(pageHeight * 100 / 42)),
      pageMarginTop: 8,
      pageWidth,
      scale: 42,
      svgViewBox: true,
    }
    const toolkit = new VerovioToolkit(await createVerovioModule())
    try {
      let mei = result.mei
      const initialSbCount = (mei.match(/<sb\/>/g) ?? []).length
      for (let iteration = 0; iteration < 4; iteration++) {
        toolkit.setOptions({ ...opts, breaks: 'encoded', pageWidth: 100000, noJustification: true })
        expect(toolkit.loadData(mei)).toBe(1)
        const breaks = extraSystemBreakMeasureIds(naturalSystemLayout(toolkit.renderToSVG(1)), (pageWidth - 100) * 10)
        if (breaks.length === 0) break
        for (const id of breaks) mei = mei.replace(`<measure xml:id="${id}"`, `<sb/><measure xml:id="${id}"`)
      }
      expect((mei.match(/<sb\/>/g) ?? []).length).toBeGreaterThan(initialSbCount)

      toolkit.setOptions({ ...opts, breaks: 'encoded', pageWidth: 100000, noJustification: true })
      expect(toolkit.loadData(mei)).toBe(1)
      const systems = naturalSystemLayout(toolkit.renderToSVG(1))
      const threshold = (pageWidth - 100) * 10 * 0.95 / 0.8
      const overWide = systems.some((system) => system.measures.length > 0
        && Math.max(...system.measures.map((measure) => measure.maxX))
          - Math.min(...system.measures.map((measure) => measure.minX)) > threshold)
      expect(overWide).toBe(false)

      toolkit.setOptions({ ...opts, breaks: 'encoded', noJustification: false })
      expect(toolkit.loadData(mei)).toBe(1)
      const svg = toolkit.renderToSVG(1)
      const edges = svg.split(/<g[^>]*class="system"/).slice(1).map((chunk) => {
        const xs = [...chunk.matchAll(/<path d="M([\d.]+) /g)].map((match) => Number(match[1]))
        return xs.length > 0 ? Math.max(...xs) : Number.NaN
      }).filter((edge) => Number.isFinite(edge))
      const justifiedEdges = edges.slice(0, -1)
      expect(justifiedEdges.length).toBeGreaterThan(1)
      expect(Math.max(...justifiedEdges) - Math.min(...justifiedEdges)).toBeLessThan(100)
    } finally {
      toolkit.destroy()
    }
  })
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
  })
})

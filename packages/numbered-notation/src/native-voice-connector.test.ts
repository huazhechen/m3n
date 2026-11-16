// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { parseM3NDocument } from '@m3n/notation'
import { layoutNativeScore } from './native-layout.js'
import { nativeSvgInk } from './native-ink.js'
import { nativeStyle } from './native-style.js'
import { DefaultTextMeasurer } from './native-measure.js'
import { renderNativePages } from './native-svg.js'
import { nativeVoiceConnectorSvg } from './native-voice-connector.js'

const textMeasurer = new DefaultTextMeasurer()
const source = '{title=双声部}{4/4}\nN: ' + Array(12).fill('1ee 2 3 4 |').join(' ')
  + '\nL: ' + '春风又绿江南岸'.repeat(6)
  + '\nB: ' + Array(12).fill('[1dd 3d 5d:h]^ 5dd^ |').join(' ')

it.each([320,600,800,1000])('keeps complete brackets inside the measured music and prefix at width %s', width => {
  const document = parseM3NDocument(source)
  for (const paged of [false,true]) {
    const layout = layoutNativeScore(document,{width,paged,textMeasurer})
    expect(layout.projection.glyphs.some(glyph => glyph.lane === 'bass' && glyph.pitches.length === 3)).toBe(true)
    for (const system of layout.systems) {
      const svg = nativeVoiceConnectorSvg(system,layout.margin)
      const ink = nativeSvgInk(svg,textMeasurer)
      const melody = system.lanes.find(lane => lane.id === 'melody')!
      const bass = system.lanes.find(lane => lane.id === 'bass')!
      expect(ink.top).toBeCloseTo(melody.y-melody.top,3)
      expect(ink.bottom).toBeCloseTo(bass.y+bass.bodyBottom!,3)
      expect(ink.top).toBeGreaterThanOrEqual(system.top-.001)
      expect(ink.bottom).toBeLessThanOrEqual(system.bottom+.001)
      expect(ink.left).toBeGreaterThan(layout.margin)
      expect(ink.right).toBeLessThan(layout.margin+nativeStyle.music)
      const root = new DOMParser().parseFromString(svg,'text/html')
      expect(root.querySelectorAll('path')).toHaveLength(2)
      expect(root.querySelector('rect')).not.toBeNull()
      expect(root.querySelector('line')).not.toBeNull()
    }
    const root = new DOMParser().parseFromString(renderNativePages(layout).join(''),'text/html')
    expect(root.querySelectorAll('[data-m3n-role="voice-connector"]')).toHaveLength(layout.systems.length)
  }
})

it('omits the bracket and joining rule when the bass is hidden', () => {
  const layout = layoutNativeScore(parseM3NDocument(source),{width:600,paged:false,textMeasurer,includeBass:false})
  expect(layout.systems.every(system => nativeVoiceConnectorSvg(system,layout.margin)==='')).toBe(true)
})

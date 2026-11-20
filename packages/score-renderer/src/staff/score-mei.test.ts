import { describe, expect, it } from 'vitest'
import { analyzeM3N, deriveScoreInteraction } from '@m3n/notation'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { scoreToMei } from './score-mei.js'
import createModule from '../../vendor/verovio/verovio-module.mjs'
import { VerovioToolkit } from 'verovio/esm'

describe('optional staff projection', () => {
  it('preserves shared source and playback identities without mutating the score', () => {
    const score = analyzeM3N('{title=春天 & <歌>}{key=D}{4/4}\nN: [123:2] 4 5 | [135:h]^ 0^ |||\nL: 春夏秋冬天\nB: 1d 2d 3d 4d | 5d^ 0^ |||').score
    const before = structuredClone(score)
    const mei = scoreToMei(score)
    for (const { xmlId } of deriveScoreInteraction(score).sourceMap) expect(mei).toContain(`xml:id="${xmlId}"`)
    expect(mei).toContain('春天 &amp; &lt;歌&gt;')
    expect(mei).toContain('clef.shape="F"')
    expect(mei).toContain('sig="2s"')
    expect(score).toEqual(before)
  })

  it('left-aligns section labels instead of centering them across the left page edge', () => {
    const score = analyzeM3N('===音阶训练\nN: 1 2 3 4 |||').score
    expect(scoreToMei(score)).toContain('<rend fontweight="bold" halign="left">音阶训练</rend>')
  })

  it('prints keyed and octave-shifted visits with matching lyrics and playback identities', () => {
    const score = analyzeM3N('{key=C}{4/4}{order=A,A@D5}\n===A\nN: 1 2 3 4 |||\nL1: 春夏秋冬\nL2: 山川天地').score
    const before = structuredClone(score)
    const mei = scoreToMei(score)
    expect(mei).toContain('xml:id="m3n-e-1-rend2" pname="d" oct="5"')
    expect(mei).toContain('sig="2s"')
    expect(mei).toContain('春')
    expect(mei).toContain('山')
    expect(score).toEqual(before)
  })

  it('engraves the complete current library with the shipped engine', async () => {
    const toolkit = new VerovioToolkit(await createModule())
    try {
      toolkit.setOptions({ font: 'Leipzig', fontFallback: 'Leipzig', pageWidth: 1500, pageHeight: 60000, scale: 38, breaks: 'smart', svgViewBox: true, header: 'none', footer: 'none' })
      const directory = fileURLToPath(new URL('../../../../src/scores/', import.meta.url))
      for (const file of readdirSync(directory, { recursive: true }).map(String).filter(file => file.endsWith('.m3n'))) {
        const score = analyzeM3N(readFileSync(`${directory}/${file}`, 'utf8')).score
        const before = structuredClone(score)
        expect(toolkit.loadData(scoreToMei(score)), file).toBeTruthy()
        expect(toolkit.getPageCount(), file).toBeGreaterThan(0)
        expect(toolkit.renderToSVG(1), file).toContain('class="staff"')
        expect(score, file).toEqual(before)
      }
    } finally { toolkit.destroy() }
  }, 120_000)
})

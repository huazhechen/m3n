// @vitest-environment jsdom
import { describe, expect, it } from 'vitest' 
import { a4ImagePlacement, a4SourcePageHeight } from './score-export'
import { frameScoreImage } from './score-image-frame'
import { scoreExportFooter } from './score-export-footer'

describe('PDF export pagination', () => {
  it('keeps the A4 content ratio at every configured source width', () => {
    expect(a4SourcePageHeight(800)).toBe(1174)
    expect(a4SourcePageHeight(1600)).toBe(2348)
  })

  it('fits a rendered page inside the A4 margins without changing its ratio', () => {
    const placement = a4ImagePlacement(800, 1300)

    expect(placement.y).toBe(12)
    expect(placement.height).toBe(273)
    expect(placement.width / placement.height).toBeCloseTo(800 / 1300)
    expect(placement.x).toBeGreaterThan(12)
    expect(placement.x + placement.width).toBeLessThan(198)
  })

  it('uses the full A4 content width for a correctly reserved page', () => {
    const placement = a4ImagePlacement(800, a4SourcePageHeight(800))

    expect(placement.x).toBeCloseTo(12)
    expect(placement.y).toBe(12)
    expect(placement.width).toBeCloseTo(186)
  })
})

describe('image export footer', () => {
  it.each(['https://score.cheesefans.com/scores/huan_le_song_01', 'https://score.cheesefans.com/works/my_song'])('places only the site address in the existing outer margin for %s', url => {
    const doc = document.implementation.createHTMLDocument()
    const page = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    page.setAttribute('viewBox', '0 0 800 1200')
    const framed = frameScoreImage([page], .06, url)
    const footer = framed.querySelector('text')!
    expect(footer.textContent).toBe('https://score.cheesefans.com/')
    expect(scoreExportFooter(url)).toEqual({ text: 'https://score.cheesefans.com/', href: url })
    expect(Number(footer.getAttribute('x'))).toBe(848)
    expect(Number(footer.getAttribute('font-size'))).toBe(16)
    expect(Number(footer.getAttribute('y'))).toBeLessThan(framed.viewBox.baseVal.height)
    expect(framed.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 800 1200')
  })
})

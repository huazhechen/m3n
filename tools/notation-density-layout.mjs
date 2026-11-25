import { vectorScorePdf } from '../packages/score-renderer/src/score-pdf.ts'
import { createSvgInkMeasurer } from './lib/svg-ink-bounds.mjs'
import { analyzeM3N, A4_CONTENT_WIDTH_MM } from '@m3n/notation'
import { prepareNumberedNotationFonts, scoreLayoutConfig, SCORE_NUMBER_FONT, SCORE_TEXT_FONT } from '@m3n/numbered-notation'
import { measureNumberedWidth } from './lib/numbered-width-measurement.mjs'
import { measureStaffWidth } from './lib/staff-width-measurement.mjs'

/** Compare the same written source and physical page width, without auto-width. */
export async function compare(source, width, { auditLayout = true, staffMusic = scoreLayoutConfig.staff.music, includeSvg = false, profile = false, includePdf = false } = {}) {
  const original = scoreLayoutConfig.staff.music
  scoreLayoutConfig.staff.music = staffMusic
  try { return await compareAtSize(source, width, auditLayout, includeSvg, profile, includePdf) }
  finally { scoreLayoutConfig.staff.music = original }
}

async function compareAtSize(source, width, auditLayout, includeSvg, profile, includePdf) {
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some(item => item.severity === 'error')) throw new Error('Invalid score source')
  const score = analysis.score
  await prepareNumberedNotationFonts(score)
  const numbered = measureNumberedWidth(score, width, { auditLayout })
  let render
  const staff = await measureStaffWidth(score, width, {}, undefined, { auditLayout, onPrepared(value) { render = value } })
  const info = render.layoutInfo()
  const numberedInfo = numbered.prepared.layoutInfo()
  const mmPerPx = A4_CONTENT_WIDTH_MM / width
  const context = document.createElement('canvas').getContext('2d')
  const inkHeight = (family, size, text) => {
    context.font = `${scoreLayoutConfig.fonts.regularWeight} ${size}px ${family}`
    const ink = context.measureText(text)
    return (ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent) * mmPerPx
  }
  const geometry = info => ({ displayedEvents: info.displayedEvents, hasBass: info.hasBass,
    averageCoreHeight: info.lines.reduce((sum, line) => sum + (line.core ? line.core.bottom - line.core.top : 0), 0) / Math.max(1, info.lines.length),
    averageInkHeight: info.lines.reduce((sum, line) => sum + line.inkHeight, 0) / Math.max(1, info.lines.length) })
  const summary = (candidate, meanLineDensity, naturalHeight) => ({
    pages: candidate.pageCount, rows: candidate.rows, meanLineDensity,
    lineDensityVariation: candidate.lineDensityVariation, lastLineSlack: candidate.lastLineSlack, lineStretchPenalty: candidate.lineStretchPenalty,
    naturalHeight, outside: candidate.outside, overlaps: candidate.overlaps,
  })
  const pdf = {}
  if (includePdf) {
    const host = document.createElement('div')
    for (const notation of ['numbered', 'staff']) {
      const pages = notation === 'staff' ? render(true) : numbered.prepared.renderPaged().map(markup => {
        host.innerHTML = markup
        return host.firstElementChild
      })
      const blob = await vectorScorePdf(pages)
      pdf[notation] = [...new Uint8Array(await blob.arrayBuffer())]
    }
  }
  return {
    ...(includePdf ? { pdf } : {}),
    ...(includeSvg ? { svg: { numbered: numbered.prepared.renderContinuous().join(''), staff: render(false).map(svg => svg.outerHTML).join('') } } : {}),
    readability: { lyricEmMm: scoreLayoutConfig.lyrics.fontSize * mmPerPx,
      lyricInkMm: inkHeight(SCORE_TEXT_FONT, scoreLayoutConfig.lyrics.fontSize, '春'),
      digitInkMm: inkHeight(SCORE_NUMBER_FONT, scoreLayoutConfig.numbered.music, '3'),
      numberedFrameMm: scoreLayoutConfig.numbered.music * 1.25 * mmPerPx,
      staffFrameMm: scoreLayoutConfig.staff.music * mmPerPx,
      staffSpaceMm: scoreLayoutConfig.staff.music / 4 * mmPerPx },
    numbered: { ...summary(numbered.candidate, numbered.prepared.quality.meanLineDensity, numbered.prepared.continuousHeight()), ...geometry(numberedInfo) },
    staff: { ...summary(staff, info.quality.meanLineDensity, render.continuousHeight()),
      spacing: info.spacing, ...geometry(info), ...(profile ? { profile: staffProfile(render(false)) } : {}) },
  }
}

/** Ink envelopes are diagnostic extents, not additive occupied areas. */
function staffProfile(pages) {
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-100000px;top:0'
  host.append(...pages)
  document.body.append(host)
  try {
    return pages.flatMap(svg => {
      const ink = createSvgInkMeasurer(svg)
      const role = node => node.closest('g.slur') ? 'slur' : node.closest('g.tie') ? 'tie'
        : node.closest('g.verse') ? 'lyrics' : node.closest('g.staff-clef') ? 'clef'
          : node.matches('.staff-line') ? 'frame' : node.closest('.inline-signature') ? 'signature'
            : node.closest('.tempo,.dynam,.dir,.reh,.repeatMark,.ending,.harm,.octave') ? 'attachment'
              : node.closest('.stem,.beam') ? 'stemsAndBeams' : 'music'
      const bounds = pieces => {
        if (!pieces.length) return null
        const x = Math.min(...pieces.map(p => p.x)), y = Math.min(...pieces.map(p => p.y))
        return { x, y, width: Math.max(...pieces.map(p => p.x + p.width)) - x,
          height: Math.max(...pieces.map(p => p.y + p.height)) - y }
      }
      return [...svg.querySelectorAll('g.system')].map(system => {
        const groups = {}
        const pieces = [...system.querySelectorAll('text,path,line,rect,circle,ellipse,polygon,polyline')]
          .map(node => ({ role: role(node), ...ink(node) })).filter(p => p.width && p.height)
        for (const piece of pieces) (groups[piece.role] ??= []).push(piece)
        const all = bounds(pieces)
        return { ink: all, categories: Object.fromEntries(Object.entries(groups).map(([role, boxes]) => [role, bounds(boxes)])),
          top: pieces.filter(p => Math.abs(p.y - all.y) < .01).map(p => p.role),
          bottom: pieces.filter(p => Math.abs(p.y + p.height - all.y - all.height) < .01).map(p => p.role) }
      })
    })
  } finally { host.remove() }
}

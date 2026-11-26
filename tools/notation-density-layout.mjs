import { selectBestWidth } from './scorebook-width.mjs'
import { vectorScorePdf } from '../packages/score-renderer/src/score-pdf.ts'
import { createSvgInkMeasurer } from './lib/svg-ink-bounds.mjs'
import { analyzeM3N, A4_CONTENT_WIDTH_MM } from '@m3n/notation'
import { prepareNumberedNotationFonts, scoreLayoutConfig, SCORE_NUMBER_FONT, SCORE_TEXT_FONT, NumberedLayoutTask, NumberedTextMeasurementCache } from '@m3n/numbered-notation'
import { measureNumberedWidth } from './lib/numbered-width-measurement.mjs'
import { prepareStaffMeasurementTask } from '@m3n/score-renderer/staff'
import { measureStaffWidth } from './lib/staff-width-measurement.mjs'

/** Compare the same written source and physical page width, without auto-width. */
export async function compare(source, width, { auditLayout = true, staffMusic = scoreLayoutConfig.staff.music, includeSvg = false, profile = false, includePdf = false, coreGap } = {}) {
  const original = scoreLayoutConfig.staff.music
  scoreLayoutConfig.staff.music = staffMusic
  try { return await compareAtSize(source, width, auditLayout, includeSvg, profile, includePdf, coreGap) }
  finally { scoreLayoutConfig.staff.music = original }
}

async function compareAtSize(source, width, auditLayout, includeSvg, profile, includePdf, coreGap) {
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some(item => item.severity === 'error')) throw new Error('Invalid score source')
  const score = analysis.score
  await prepareNumberedNotationFonts(score)
  const settings = coreGap === undefined ? {} : { coreGap }
  const numbered = measureNumberedWidth(score, width, { auditLayout, settings })
  let render
  const staff = await measureStaffWidth(score, width, settings, undefined, { auditLayout, onPrepared(value) { render = value } })
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
    numbered: { ...summary(numbered.candidate, numbered.prepared.quality.meanLineDensity, numbered.prepared.continuousHeight()), spacing: numberedInfo.spacing, measureRows: numberedInfo.measureRows, ...geometry(numberedInfo) },
    staff: { ...summary(staff, info.quality.meanLineDensity, render.continuousHeight()),
      collisionDensity: info.lines.reduce((sum, line) => sum + line.minimum / info.availableWidth, 0) / Math.max(1, info.lines.length),
      spacing: info.spacing, measureRows: info.lines.map(line => line.measures), ...geometry(info),
      ...(profile ? { pagination: info.pageFit, localReading: info.lines.map(line => line.localReadingPenalty), profile: staffProfile(render(false)) } : {}) },
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
        return { ink: all, reading: [...system.querySelectorAll('g.measure')].map(measure => ({ id: measure.id,
          worstRatio: Number(measure.dataset.m3nReadingRatio), penalty: Number(measure.dataset.m3nReadingPenalty) })),
          categories: Object.fromEntries(Object.entries(groups).map(([role, boxes]) => [role, bounds(boxes)])),
          top: pieces.filter(p => Math.abs(p.y - all.y) < .01).map(p => p.role),
          bottom: pieces.filter(p => Math.abs(p.y + p.height - all.y - all.height) < .01).map(p => p.role) }
      })
    })
  } finally { host.remove() }
}


/** Probe the same coarse and fine widths as the staff reader, then audit the winner separately. */
export async function preferredStaffWidth(source) {
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some(item => item.severity === 'error')) throw new Error('Invalid score source')
  await prepareNumberedNotationFonts(analysis.score)
  const { best } = await selectBestWidth(width => measureStaffWidth(analysis.score, width))
  return best.width
}


/** Independently reproduce each reader's complete coarse/fine width search. */
export async function optimalPages(source) {
  const analysis = analyzeM3N(source)
  if (analysis.diagnostics.some(item => item.severity === 'error')) throw new Error('Invalid score source')
  const score = analysis.score
  await prepareNumberedNotationFonts(score)
  const settings = { layoutTask: new NumberedLayoutTask(), textMeasurementCache: new NumberedTextMeasurementCache() }
  const numberedSearch = await selectBestWidth(width => measureNumberedWidth(score, width, { settings }).candidate)
  const numbered = measureNumberedWidth(score, numberedSearch.best.width, { settings, auditLayout: true })
  const staffTask = await prepareStaffMeasurementTask(score)
  const staffSearch = await selectBestWidth(width => measureStaffWidth(score, width, {}, undefined, { task: staffTask }))
  let staffPrepared
  const staff = await measureStaffWidth(score, staffSearch.best.width, {}, undefined,
    { task: staffTask, auditLayout: true, onPrepared(value) { staffPrepared = value } })
  const summarize = (candidate, displayedEvents, search) => ({ width: candidate.width,
    pages: candidate.pageCount, rows: candidate.rows, displayedEvents,
    outside: candidate.outside, overlaps: candidate.overlaps, requests: search.candidates.length,
    candidates: search.candidates.map(({ width, pageCount, rows, qualityScore, error }) => ({ width, pages: pageCount, rows, qualityScore, ...(error ? { error } : {}) })) })
  return { numbered: summarize(numbered.candidate, numbered.prepared.layoutInfo().displayedEvents, numberedSearch),
    staff: summarize(staff, staffPrepared.layoutInfo().displayedEvents, staffSearch) }
}

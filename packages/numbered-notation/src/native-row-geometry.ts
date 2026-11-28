import { isNativeMeasureNumber } from './native-system-labels.js'
import { cloneNativeProjection, type NativeMeasure } from './native-model.js'
import { placeNativeLyrics, nativeLyricPieces } from './native-lyrics.js'
import { cacheNativeHorizontal, nativeCoreHorizontalIsAffine, nativeHorizontalSpacing, placeNativeCoreHorizontal, type NativeHorizontalTemplates } from './native-horizontal.js'
import type { NativeSystem } from './native-layout-model.js'
import type { TextMeasurer } from './native-measure.js'
import { nativeLanePieces, placeNativeLanes } from './native-lanes.js'
import { nativeCoreInkBox, nativeSystemCore } from './native-core.js'
import { nativeSvgPieces } from './native-ink.js'
import { nativeVoiceConnectorSvg } from './native-voice-connector.js'
import type { ScorePageBlock } from './layout/pagination.js'

/** Consume the same placed primitives as drawing. No independently measured
 * final heights: row-wide lyric baselines and dynamic relations are resolved. */
export function nativeRowGeometry(system: NativeSystem, measurer: TextMeasurer, margin: number): ScorePageBlock {
  const height = placeNativeLanes(system), pieces = nativeLanePieces(system, measurer)
  const core = nativeSystemCore(system, measurer) ?? { top: 0, bottom: height }
  const primitives = system.lanes.flatMap(lane => (pieces.get(lane.id) ?? []).map(piece => ({ left:piece.left,right:piece.right,
    top: piece.top + lane.y, bottom: piece.bottom + lane.y })))
  primitives.push(...nativeSvgPieces(nativeVoiceConnectorSvg(system, margin, measurer), measurer))
  const ink = primitives
  // Visibility controls painting only. Reserve identical page bounds so toggling
  // measure numbers cannot change pagination or automatic width selection.
  const boundaryInk = (system.decorationLayout ?? []).filter(isNativeMeasureNumber)
    .flatMap(item => {
      const y = system.lanes.find(lane => lane.id === item.lane)!.y
      return (item.ink ?? nativeSvgPieces(item.svg, measurer)).map(piece => ({ ...piece, top: piece.top + y, bottom: piece.bottom + y }))
    })
  return { resolvedInk: true, height, baseline: system.lanes[0]?.y ?? 0, core, ink, boundaryInk,
    coreGapBefore: system.measures[0]?.coreGapBefore,
    coreGapScale: 1 }
}

/** Optimistic page-feasibility bound. Retain first-lane lyric tiers, their shared music floor and the
 * shallowest sounding-body top; omit all other lanes/attachments. Their
 * real geometry can only require more space. This bound cannot reject a plan
 * made feasible by horizontal interleaving. */
export function nativeRowCoreLowerBound(measures: NativeMeasure[], measurer: TextMeasurer, horizontal?: { width: number; minimumNoteGap?: number; minimumNoteGapFloor?: number; equalMeasures?: boolean }, templates?: NativeHorizontalTemplates): ScorePageBlock {
  const cloned = cloneNativeProjection({measures,glyphs:measures.flatMap(m=>m.columns.flatMap(c=>c.glyphs)),diagnostics:[],hasBass:false}).measures
  const glyphs = cloned.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
  const ids = [...new Set(glyphs.map(glyph => glyph.lane))].sort((a,b) => a === 'melody' ? -1 : b === 'melody' ? 1 : a === 'bass' ? 1 : b === 'bass' ? -1 : a.localeCompare(b))
  const members = glyphs.filter(glyph => glyph.lane === ids[0])
  const rows = [...new Set(members.flatMap(glyph => [...glyph.lyrics].filter(([,data]) => data.annotation || data.texts.some(text => text.replaceAll('\u200B','').trim())).map(([row]) => row)))].sort((a,b)=>a-b)
  const lane = { id: ids[0] ?? 'melody', y: 0, top: 0, bottom: 0, lyricBottom: members.length ? Math.max(...members.map(glyph => glyph.musicBottom ?? glyph.bottom)) : 0, rows }
  const system = { measures: cloned, lanes: [lane], numericGeometry: true, relations: [] } as unknown as NativeSystem
  placeNativeLyrics(system, lane, measurer)
  const bottom = Math.max(0, ...members.flatMap(glyph => [...(glyph.lyricBaselines ?? [])].flatMap(([row,baseline]) =>
    nativeLyricPieces(glyph.lyrics.get(row)!,glyph.x,baseline,measurer).map(piece=>piece.bottom))))
  const top = members.length ? Math.max(...members.map(glyph => Math.min(0, glyph.coreInk ? nativeCoreInkBox(glyph.coreInk).top : 0))) : 0
  let core = { top, bottom }
  if (horizontal) {
    // Both endpoint probes consume the same immutable constraint chain.
    cacheNativeHorizontal(horizontal, templates)
    // Credit-based stretch can change slope inside the width interval.
    // Its endpoints alone are insufficient; retain the width-independent
    // shallowest-body proof unless every spring has zero activation force.
    if (nativeCoreHorizontalIsAffine(cloned, horizontal)) {
      // With no dynamic profiles, each cell weight is affine in line width.
      // Its weighted core is a ratio of affine functions and is monotone.
      // Endpoints therefore bound every justified or shortened ending width.
      const minimum = nativeHorizontalSpacing(cloned, horizontal).minimumWidth
      placeNativeCoreHorizontal(cloned, horizontal, minimum)
      const compact = nativeSystemCore(system, measurer)
      placeNativeCoreHorizontal(cloned, horizontal, Math.max(minimum, horizontal.width))
      const full = nativeSystemCore(system, measurer)
      if (compact && full) core = { top: Math.max(compact.top, full.top), bottom: Math.min(compact.bottom, full.bottom) }
    }
  }
  // Sounding ink has width-independent vertical extents. Keep these page
  // edges even when a shortened ending's dynamic profiles are unresolved.
  const music=members.flatMap(glyph=>glyph.musicInk ?? [])
  const edge={top:Math.min(core.top,...music.map(piece=>piece.top)),bottom:Math.max(core.bottom,...music.map(piece=>piece.bottom))}
  return { height: edge.bottom - edge.top, core, ink: [{ left: 0, right: 1, ...edge }], coreGapBefore: measures[0]?.coreGapBefore,
    coreGapScale: 1 }
}

// Diagnostic only: preserve the horizontal plans, evaluate conservative row
// envelopes, and keep measured geometry separate from the pagination microbench.
// Per-measure cores here come from complete engraving; this is not yet a
// width-independent measure-height cache or a complete new width search.
import { analyzeM3N, A4_CONTENT_ASPECT_RATIO } from '@m3n/notation'
import { NumberedLayoutTask, NumberedTextMeasurementCache } from '@m3n/numbered-notation'
import { measureNumberedWidth } from './lib/numbered-width-measurement.mjs'
import { prepareNativePagination } from '../packages/numbered-notation/dist/native-pagination.js'
import { nativeSystemCore } from '../packages/numbered-notation/dist/native-core.js'
import { nativeCoreGap } from '../packages/numbered-notation/dist/native-style.js'
export { initialize } from './numbered-spacing-layout.mjs'
const cache = new NumberedTextMeasurementCache()
function rowsPagination(rows, pageHeight, margin, gap, headerGap, literalGap=false) {
 const positions=[]; let page=0, baseline=0, previous, bottom=margin; const used=[]
 for(const row of rows) {
  let y=margin-row.top
  if(previous) {
   const g=row.coreGapBefore??(literalGap?gap:gap*(previous.coreGapScale??1))
   const separation=row.music&&previous.music?Math.max(g,previous.lowerNonCore+row.upperNonCore+g/2):Math.max(headerGap,previous.lowerNonCore+row.upperNonCore+gap/2)
   y=Math.max(y,baseline+previous.coreBottom-row.coreTop+separation+(row.gapBefore??0))
  }
  if(previous&&y+row.bottom>pageHeight-margin+1e-6){used.push(bottom+margin);page++;previous=undefined;y=margin-row.top;bottom=margin}
  if(y+row.bottom>pageHeight-margin+1e-6)throw new Error('Envelope row exceeds page')
  positions.push({page,top:y});baseline=y;bottom=Math.max(bottom,y+row.bottom);previous=row
 }
 if(rows.length)used.push(bottom+margin)
 return {pages:used.length,used,positions}
}
function envelope(block, replacementCore) {
 const axis=block.baseline??0
 const ink=[...(block.ink??[]),...(block.boundaryInk??[])]
 const core=replacementCore??(block.core?{top:block.core.top-axis,bottom:block.core.bottom-axis}:undefined)
 const rawTop=Math.min(0,...ink.map(p=>p.top-axis)),rawBottom=Math.max(0,...ink.map(p=>p.bottom-axis))
 const coreTop=core?.top??rawTop,coreBottom=core?.bottom??rawBottom
 const top=Math.min(rawTop,coreTop),bottom=Math.max(rawBottom,coreBottom)
 return {music:!!block.core,top,bottom,coreTop,coreBottom,upperNonCore:Math.max(0,coreTop-top),lowerNonCore:Math.max(0,bottom-coreBottom),coreGapScale:block.coreGapScale,coreGapBefore:block.coreGapBefore,gapBefore:block.gapBefore}
}
function time(fn,repeats=20){
 const started=performance.now();let last,checksum=0
 for(let i=0;i<repeats;i++){
  last=fn(i)
  for(const position of last.positions)checksum+=position.page*31+position.top
 }
 globalThis.__rowEnvelopeBenchmarkSink=(globalThis.__rowEnvelopeBenchmarkSink??0)+checksum
 return {ms:(performance.now()-started)/repeats,last}
}
export function measure(source,width,minimumNoteGap){
 const score=analyzeM3N(source).score
 const started=performance.now()
 const {candidate,prepared}=measureNumberedWidth(score,width,{settings:{layoutTask:new NumberedLayoutTask(),textMeasurementCache:cache,pageConstrainedBreaks:false,minimumNoteGap}})
 const layout=prepared.layout,blocks=layout.verticalBlocks,headerCount=layout.headerBlocks.length
 const layoutMs=performance.now()-started
 const gap=nativeCoreGap(score),headerGap=gap*.8,margin=layout.margin,pageHeight=Math.floor(width*A4_CONTENT_ASPECT_RATIO)
 const options={pageHeight,margin,gap,headerGap,maxGap:gap}
 const cached=prepareNativePagination(blocks)
 const exact=cached(options)
 const envelopeStarted=performance.now()
 const rowEnvelopes=blocks.map(b=>envelope(b))
 const boxOnlyPreparationMs=performance.now()-envelopeStarted
 const coreStarted=performance.now()
 const measureMax=blocks.map((block,i)=>{
  if(i<headerCount)return envelope(block)
  const system=layout.systems[i-headerCount],axis=system.lanes[0]?.y??0
  const cores=system.measures.map(measure=>nativeSystemCore({...system,measures:[measure]},layout.measurer)).filter(Boolean)
  return envelope(block,cores.length?{top:Math.min(...cores.map(c=>c.top-axis)),bottom:Math.max(...cores.map(c=>c.bottom-axis))}:undefined)
 })
 const measureMaxPreparationMs=performance.now()-coreStarted
 const run=(rows,literal=false,height=pageHeight)=>rowsPagination(rows,height,margin,gap,headerGap,literal)
 const oldCore=run(rowEnvelopes),maxCore=run(measureMax),literal=run(measureMax,true)
 const exactCold=time(i=>prepareNativePagination(blocks)({...options,pageHeight:pageHeight+(i%2)*1e-6}))
 const exactWarm=time(i=>cached({...options,pageHeight:pageHeight+(i%2)*1e-6}),1000)
 const boxTime=time(i=>run(measureMax,false,pageHeight+(i%2)*1e-6),10000)
 const natural=cached({...options,pageHeight:Infinity}).heights[0]??0
 const naturalBox=rowsPagination(measureMax,Infinity,margin,gap,headerGap).used[0]??0
 return {width,rows:candidate.rows,pages:candidate.pageCount,selectedGap:layout.options.minimumNoteGap,exactMinPages:exact.heights.length,boxOnlyPages:oldCore.pages,measureMaxPages:maxCore.pages,literalGapPages:literal.pages,
  exactUsed:exact.positions.map((p,i)=>({page:p.page,top:p.top})),boxUsed:maxCore.used,naturalHeight:natural,naturalBoxHeight:naturalBox,
  spacingCost:candidate.spacingCost, horizontalCost:candidate.totalCost-candidate.fontSizeCost, layoutMs,stageTimings:candidate.timings,boxOnlyPreparationMs,measureMaxPreparationMs,
  exactColdMs:exactCold.ms,exactWarmMs:exactWarm.ms,boxPaginationMs:boxTime.ms}
}

export function measureBoth(source,width) {
 const automatic=measure(source,width)
 const other=measure(source,width,automatic.selectedGap===8?16:8)
 const tiers=[automatic,other]
 const choose=key=>[...tiers].sort((a,b)=>a[key]-b[key]||a.horizontalCost-b.horizontalCost||b.selectedGap-a.selectedGap)[0]
 const box=choose('boxOnlyPages'),max=choose('measureMaxPages'),literal=choose('literalGapPages')
 return {...automatic,tiers,boxOnlyPages:box.boxOnlyPages,measureMaxPages:max.measureMaxPages,literalGapPages:literal.literalGapPages,
  boxOnlySelectedGap:box.selectedGap,measureMaxSelectedGap:max.selectedGap,literalSelectedGap:literal.selectedGap,
  measureMaxNaturalHeight:max.naturalBoxHeight}
}

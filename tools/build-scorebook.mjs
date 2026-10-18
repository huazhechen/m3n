import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { chromium } from '@playwright/test'
import { build } from 'vite'
import { paginateScorebookLayout, packScorebookGroup } from './scorebook-pagination.mjs'

const root = resolve(import.meta.dirname, '..')
const output = join(root, 'scorebook')
const plan = JSON.parse(readFileSync(join(output,'editorial-plan.json'),'utf8'))
const temp = join(root, '.tmp',plan.outputKey??'scorebook')
const pdfFile=plan.outputPdf??'循序渐进简谱集-v1.pdf'
const previous=JSON.parse(readFileSync(join(output,'layout-record-v1.json'),'utf8'))
const previousById=new Map(previous.entries.map(e=>[e.id,e]))
const secondEdition=JSON.parse(readFileSync(join(output,'layout-record-v2.json'),'utf8'))
const secondById=new Map(secondEdition.entries.map(e=>[e.id,e]))
const sharedEntryIds=new Set(secondEdition.pages.filter(p=>p.items.length>1).flatMap(p=>p.items.map(e=>e.id)))
mkdirSync(temp, { recursive: true })
mkdirSync(join(temp,'pages'), { recursive: true })
const staged=join(temp,'staged');mkdirSync(staged,{recursive:true})
const sourceFiles = readdirSync(join(root,'src/scores')).filter(f=>f.endsWith('.m3n')).sort()
assert.deepEqual(plan.entries.map(e=>e.file).sort(), sourceFiles, 'Every original source must be included exactly once')
assert.equal(new Set(plan.entries.map(e=>e.id)).size,plan.entries.length,'Entry IDs must be unique')
const training = readFileSync(join(root,'src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n'),'utf8')
const trainingEntry=plan.entries.find(e=>e.file==='ban_yin_jie_kou_qin_ji_ben_gong_01.m3n')
assert.equal(trainingEntry,plan.entries[0],'Daily training opens the first section')
assert.equal(trainingEntry.section,'basics')
for(const entry of plan.entries) {
  assert(entry.width>=520&&entry.width<=1040,'Keep note sizes within the reading range')
  entry.source=readFileSync(join(root,'src/scores',entry.file),'utf8')
  entry.sourceSha256=createHash('sha256').update(entry.source).digest('hex')
}
assert.equal(trainingEntry.source,training,'Daily training preserves the complete original source and order')
await build({configFile:false,logLevel:'error',build:{outDir:join(temp,'bundle'),emptyOutDir:true,minify:false,
  lib:{entry:join(root,'tools/scorebook-layout.mjs'),name:'scorebook',formats:['iife'],fileName:()=>'bundle.js'}}})
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||['/usr/bin/chromium','/usr/sbin/chromium','/usr/bin/chromium-browser'].find(existsSync),headless:true})
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const svgText=(text,x,y,size=14,attrs='')=>`<text x="${x}" y="${y}" font-size="${size}" font-family="Scorebook Text" ${attrs}>${escape(text)}</text>`
const profile=plan.page
const pageWidth=profile.width,pageHeight=profile.height
const bodyX=profile.outerMargin,bodyWidth=pageWidth-bodyX*2,bodyTop=profile.bodyTop,bodyBottom=profile.bodyBottom,bodyHeight=bodyBottom-bodyTop
const shortGap=profile.shortWorkGap
const minimumFillPercent=profile.minimumFillPercent??0
assert(Number.isFinite(minimumFillPercent)&&minimumFillPercent>=0&&minimumFillPercent<100,'Minimum page fill must be between 0 and 100')
const maximumNotePx=profile.maximumNotePx??null
assert(maximumNotePx===null||Number.isFinite(maximumNotePx)&&maximumNotePx>0,'Maximum note size must be a positive finite number')
const minimumScoreWidth=maximumNotePx===null?0:22*bodyWidth/maximumNotePx
const spacing={pageMargin:profile.scoreMargin,systemGap:profile.systemGap}
const renderScale=width=>bodyWidth/width
function paginate(layout,entry) {
 return paginateScorebookLayout(layout,entry,{bodyHeight,scale:renderScale(layout.width),minimumFillPercent})
}
function candidateCost(layout,ranges,width,preferred,fillPage) {
 const s=renderScale(width)
 if(fillPage)return ranges.length*1000+width*0.6
 return ranges.length*1000 + Math.abs(width-preferred)*0.6 + ranges.reduce((sum,[a,b])=>sum+((bodyHeight-(layout.cuts[b]-layout.cuts[a]+(a?36:0))*s)/bodyHeight)**2,0)*20
}
try {
 const page=await browser.newPage({viewport:{width:1000,height:1200},deviceScaleFactor:1})
 await page.route('**/*',route=>route.request().url().endsWith('/fonts/NotoSerifCJKsc-Regular.otf')
  ?route.fulfill({path:join(root,'public/fonts/NotoSerifCJKsc-Regular.otf'),contentType:'font/otf'})
  :route.fulfill({contentType:'text/html',body:'<!doctype html><title>Offline scorebook</title>'}))
 await page.goto('http://scorebook.local/')
 await page.setContent(`<style>body{margin:0} #scratch{position:absolute;left:-20000px} #print-page{width:${pageWidth}px;background:white}</style><div id="scratch"></div><main id="print-page"></main>`)
 await page.addScriptTag({path:join(temp,'bundle/bundle.js')})
 await page.evaluate(font=>window.scorebook.prepare(font),readFileSync(join(root,'public/fonts/NotoSerifCJKsc-Regular.otf')).toString('base64'))
 const cacheFolder=join(temp,'cache');mkdirSync(cacheFolder,{recursive:true})
 const rendererHash=createHash('sha256').update(readFileSync(join(temp,'bundle/bundle.js'))).update(readFileSync(join(root,'public/fonts/NotoSerifCJKsc-Regular.otf'))).digest('hex')
 const measured=[]
 for(const [i,entry] of plan.entries.entries()) {
  let best,fillPage=Boolean(entry.pageCount)
  const summaries=[],rejectedCandidates=[],sharedLayouts=new Map()
  const entryOptions={...spacing,showCredits:plan.showCredits??true,includeBass:entry.includeBass??true,uniformSystemHeight:entry.uniformSystemHeight??plan.uniformSystemHeight??false,...(entry.wrap?{wrap:entry.wrap}:{})}
  const widths=(entry.widthLocked?[entry.width]:[...new Set([entry.width,...plan.widthCandidates,...(entry.widthCandidates??[])])]).filter(width=>width>=minimumScoreWidth)
  assert(widths.length,`${entry.title}: no candidate meets the maximum note size`)
  for(const width of widths) {
   const key=createHash('sha256').update(rendererHash+JSON.stringify({...entryOptions,systemGap:entry.systemGap??spacing.systemGap})+entry.source+width).digest('hex'),cachePath=join(cacheFolder,key+'.json')
   let layout=existsSync(cachePath)?JSON.parse(readFileSync(cachePath,'utf8')):null
   const rejected=[]
   if(!layout)for(const systemGap of [...new Set([entry.systemGap??spacing.systemGap,20,22,24])]) {
    const trial=await page.evaluate(({source,width,spacing})=>window.scorebook.measure(source,width,spacing),{source:entry.source,width,spacing:{...entryOptions,systemGap}}).catch(error=>({renderError:error.message}))
    if(trial.renderError||trial.outside.length||trial.overlaps.length||trial.clipped.length){rejected.push({systemGap,reason:trial.renderError??'Unsafe geometry'});continue}
    layout={...trial,systemGap,rejectedSpacing:rejected};break
   }
   if(!layout){rejectedCandidates.push({width,reasons:rejected});continue}
   layout.systemGap??=spacing.systemGap
   writeFileSync(cachePath,JSON.stringify(layout))
   assert.equal(layout.outside.length,0,`${entry.title}: outside page at ${width}`)
   assert.equal(layout.overlaps.length,0,`${entry.title}: overlapping lyrics or notes at ${width}`)
   assert.equal(layout.clipped.length,0,`${entry.title}: unsafe system cuts at ${width}`)
   if(width===entry.width)fillPage=Boolean(entry.pageCount)||!entry.widthLocked&&!sharedEntryIds.has(entry.id)&&!(layout.rows<=5&&layout.height*renderScale(width)<bodyHeight*0.6)
   const ranges=paginate(layout,entry)
   if(!ranges){rejectedCandidates.push({width,reason:'Cannot meet page count, safe cuts and minimum page fill together'});continue}
   const cost=candidateCost(layout,ranges,width,entry.width,fillPage)
   summaries.push({width,systemGap:layout.systemGap,rows:layout.rows,pages:ranges.length,cost:Number(cost.toFixed(2))})
   if(entry.sharePage&&ranges.length===1)sharedLayouts.set(width,{...layout,ranges,cost})
   if(!best||cost<best.cost)best={...layout,ranges,cost}
  }
  assert(best,`${entry.title}: no safe layout: ${JSON.stringify(rejectedCandidates)}`)
  measured.push({...entry,layout:best,candidates:summaries,rejectedCandidates,sharedLayouts,fillPage})
  console.log(`${String(i+1).padStart(3)}/${plan.entries.length} ${entry.title}: ${best.width}px ${best.rows} systems [${best.ranges.map(([a,b])=>b-a)}]`)
 }
 writeFileSync(join(temp,'layouts.json'),JSON.stringify(measured))
 const musicPages=[]
 // Pack each consecutive group of short works with balanced whitespace.
 for(let i=0;i<measured.length;) {
  const entry=measured[i]
  if(entry.sharePage&&entry.layout.ranges.length===1) {
   const group=[entry];let j=i+1
   while(j<measured.length) {const e=measured[j];if(e.breakBefore||!e.sharePage||e.layout.ranges.length!==1||e.section!==entry.section||e.group!==entry.group)break;group.push(e);j++}
   const maximumSharedWidth=Math.min(...group.map(e=>e.maximumSharedWidth??plan.baseWidth))
   const packed=packScorebookGroup(group,{bodyHeight,shortGap,renderScale,minimumFillPercent,maximumSharedWidth})
   assert(packed,`No shared layout above ${minimumFillPercent}% for ${group.map(e=>e.title).join(' / ')}`)
   for(const {start:a,end:b,layouts} of packed) {
    const target={section:entry.section,items:[],used:0};musicPages.push(target)
    for(let k=a;k<b;k++) {const e=group[k],l=layouts[k-a],y=target.used+(k>a?shortGap:0),height=l.height*renderScale(l.width);e.layout=l;target.items.push({entry:e,start:0,end:l.rows,index:0,y,height,cropTop:0,cropBottom:l.height});target.used=y+height}
   }
   i=j
  } else {
   const l=entry.layout,s=renderScale(l.width)
   for(const [index,[start,end]] of l.ranges.entries()) {
    const cropTop=l.cuts[start],cropBottom=l.cuts[end],height=(cropBottom-cropTop)*s+(start?36*s:0)
    musicPages.push({section:entry.section,items:[{entry,start,end,index,y:0,height,cropTop,cropBottom}],used:height})
   }
   i++
  }
 }
 assert(musicPages.every(p=>p.used/bodyHeight*100>minimumFillPercent),'Every music page must exceed the minimum page fill')
 assert(musicPages.every(p=>p.used<=bodyHeight+1e-6),'Every music page must fit the content area')
 // Keep each original score as one contents entry, including the full daily training.
 const tocItems=plan.sections.flatMap(section=>[{section},...measured.filter(e=>e.section===section.id).map(entry=>({entry}))])
 const tocCount=2,tocColumns=2,frontCount=1+tocCount,tocColumnItems=[]
 let tocCursor=0
 for(let column=0;column<tocCount*tocColumns;column++) {
  const remainingColumns=tocCount*tocColumns-column
  let end=tocCursor+Math.ceil((tocItems.length-tocCursor)/remainingColumns)
  if(remainingColumns>1&&tocItems[end-1]?.section)end--
  tocColumnItems.push(tocItems.slice(tocCursor,end));tocCursor=end
 }
 assert.equal(tocCursor,tocItems.length,'The contents must include every entry')
 const entryPages=new Map()
 for(const [index,p] of musicPages.entries()) for(const item of p.items) {
  const pages=entryPages.get(item.entry.id)??[];pages.push(frontCount+index+1);entryPages.set(item.entry.id,pages)
 }
 const total=frontCount+musicPages.length
 const footer=num=>svgText(String(num),pageWidth-bodyX,pageHeight-16,9,'text-anchor="end" fill="#888"')
 const pageSvg=(content,num)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}"><rect width="${pageWidth}" height="${pageHeight}" fill="white"/>${content}${footer(num)}</svg>`
 const pages=[]
 let cover=svgText('循序渐进',74,250,58)+svgText('简谱集',74,333,72)+`<line x1="78" y1="375" x2="340" y2="375" stroke="#333" stroke-width="2"/>`
 cover+=svgText('基础练习 · 民歌经典 · 流行歌曲 · 影视与器乐',78,426,18)
 cover+=svgText(`${sourceFiles.length} 份完整原谱 · ${sourceFiles.length-1} 首乐曲与一套每日基本功`,78,468,16)
 cover+=svgText(plan.edition,78,506,16)
 for(const [i,section] of plan.sections.entries())cover+=svgText(section.title,78,620+i*43,18)
 cover+=svgText('每日基本功 · 旋律 · 节奏 · 音乐表现',78,937,16)+svgText('先熟悉节奏与乐句，再逐步加入速度与表情。',78,997,14)
 pages.push({kind:'cover',svg:pageSvg(cover,1)})
 for(let t=0;t<tocCount;t++) {
  let content=svgText('目录',56,70,30)+svgText(`${t+1} / ${tocCount}`,pageWidth-48,68,14,'text-anchor="end"')
  const tocMargin=40,tocGap=32,tocWidth=(pageWidth-2*tocMargin-tocGap)/tocColumns
  for(let column=0;column<tocColumns;column++) {
   const x=tocMargin+column*(tocWidth+tocGap),right=x+tocWidth
   content+=`<g data-scorebook-toc-column="${column}" data-scorebook-left="${x}" data-scorebook-right="${right}">`
   content+=svgText('编号  曲目 / 训练',x,110,13,'fill="#666"')+svgText('页码',right,110,13,'text-anchor="end" fill="#666"')
   const rows=tocColumnItems[t*tocColumns+column]
   assert(rows.length<=26,'Each contents column must fit the page')
   assert(!rows.at(-1)?.section,'A contents section heading must stay with its first entry')
   for(const [j,row]of rows.entries()) {
    const y=145+j*36
    if(row.section){content+=svgText(row.section.title,x,y,16,'font-weight="700"');continue}
    const e=row.entry,nums=entryPages.get(e.id),label=nums.length===1?nums[0]:`${nums[0]}–${nums.at(-1)}`
    content+=`<g data-scorebook-toc-entry="${escape(e.id)}">`+svgText(`${String(measured.indexOf(e)+1).padStart(3,'0')}  ${e.title}`,x,y,15,'data-scorebook-role="toc-title"')+svgText(label,right,y,14,'text-anchor="end" data-scorebook-role="toc-pages"')+'</g>'
   }
   content+='</g>'
  }
  await page.locator('#print-page').evaluate((host,markup)=>{host.innerHTML=markup},pageSvg(content,t+2))
  const contentsIssues=await page.evaluate(()=>[...document.querySelectorAll('[data-scorebook-toc-column]')].flatMap(column=>{
   const left=Number(column.getAttribute('data-scorebook-left')),right=Number(column.getAttribute('data-scorebook-right')),issues=[]
   for(const text of column.querySelectorAll('text')){const b=text.getBBox();if(b.x<left-.5||b.x+b.width>right+.5||b.y+b.height>1095)issues.push(text.textContent)}
   for(const entry of column.querySelectorAll('[data-scorebook-toc-entry]')){const a=entry.querySelector('[data-scorebook-role="toc-title"]').getBBox(),b=entry.querySelector('[data-scorebook-role="toc-pages"]').getBBox();if(a.x+a.width+8>b.x)issues.push(entry.textContent)}
   return issues
  }))
  assert.deepEqual(contentsIssues,[],'Contents text must fit its column and leave room for page numbers')
  pages.push({kind:'contents',svg:pageSvg(content,t+2)})
 }
 for(const [i,p]of musicPages.entries()) {
  const num=frontCount+i+1
  let content=''
  for(const item of p.items) {
   const {entry:e,start,end,y,cropTop,cropBottom}=item,l=e.layout,s=renderScale(l.width)
   const label=`${String(measured.indexOf(e)+1).padStart(3,'0')} · ${e.group}`
   content+=svgText(label,bodyX+8,bodyTop+y-6,9,'fill="#666"')
   if(start)content+=svgText(`${e.title}（续）`,bodyX+8,bodyTop+y+22*s,20)
   const markup=l.markup.replace(/<svg[^>]*>/,`<svg x="${bodyX}" y="${bodyTop+y+(start?36*s:0)}" width="${bodyWidth}" height="${(cropBottom-cropTop)*s}" viewBox="0 ${cropTop} ${l.width} ${cropBottom-cropTop}" overflow="hidden">`)
   content+=markup
   assert(end>start)
  }
  pages.push({kind:'music',svg:pageSvg(content,num)})
 }
 const records=measured.map((e,i)=>{
  const first=previousById.get(e.id),second=secondById.get(e.id)
  return {order:i+1,id:e.id,title:e.title,file:e.file,includeBass:e.includeBass??true,uniformSystemHeight:e.uniformSystemHeight??plan.uniformSystemHeight??false,equalMeasures:e.layout.equalMeasures??false,wrap:e.wrap??'normal',baselineSteps:e.layout.baselineSteps,voltaSystems:e.layout.voltaSystems,paragraphSystems:e.layout.paragraphSystems,section:e.section,group:e.group,reason:e.reason,width:e.layout.width,systemGap:e.layout.systemGap,relativeScalePercent:Number((plan.baseWidth/e.layout.width*100).toFixed(2)),screenNotePx:Number((22*bodyWidth/e.layout.width).toFixed(2)),versusV1Percent:first?Number(((bodyWidth/e.layout.width)/(704/first.width*pageWidth/794)*100).toFixed(2)):null,versusV2Percent:second?Number(((bodyWidth/e.layout.width)/(secondEdition.body.width/second.width)*100).toFixed(2)):null,previousPages:first?.pages??[],secondEditionPages:second?.pages??[],pages:entryPages.get(e.id),systems:e.layout.rows,systemsPerPage:e.layout.ranges.map(([a,b])=>b-a),sourceSha256:e.sourceSha256,candidates:e.candidates,rejectedCandidates:e.rejectedCandidates,fillPage:e.fillPage,reviewNote:e.reviewNote}
 })
 const pageRecords=musicPages.map((p,i)=>({page:frontCount+i+1,section:p.section,fillPercent:Number((p.used/bodyHeight*100).toFixed(1)),items:p.items.map(item=>({id:item.entry.id,title:item.entry.title,systems:[item.start+1,item.end],width:item.entry.layout.width,systemGap:item.entry.layout.systemGap,top:Number(item.y.toFixed(2)),height:Number(item.height.toFixed(2))}))}))
 const oversizedNoteEntries=records.filter(e=>maximumNotePx!==null&&22*bodyWidth/e.width>maximumNotePx+1e-6).length
 assert.equal(oversizedNoteEntries,0,'Every score must meet the maximum note size')
 const report={title:plan.title,edition:plan.edition,showCredits:plan.showCredits??true,uniformSystemHeight:plan.uniformSystemHeight??false,rendererSha256:rendererHash,sourceCount:sourceFiles.length,entryCount:records.length,pageCount:total,frontPages:frontCount,baseWidth:plan.baseWidth,page:profile,body:{width:bodyWidth,height:bodyHeight},entries:records,pages:pageRecords,validation:{sourceCoverage:true,trainingSourcePreserved:true,geometryCandidates:records.reduce((s,e)=>s+e.candidates.length,0),minimumMusicPageFillPercent:Number(Math.min(...musicPages.map(p=>p.used/bodyHeight*100)).toFixed(3)),underfilledMusicPages:musicPages.filter(p=>p.used/bodyHeight*100<=minimumFillPercent).length,outside:0,overlaps:0,unsafeCuts:0,orphanContinuationPages:pageRecords.flatMap(p=>p.items).filter(item=>item.systems[0]>1&&item.systems[1]-item.systems[0]+1<3).length}}
 report.validation.maximumMusicNotePx=Number(Math.max(...records.map(e=>22*bodyWidth/e.width)).toFixed(3))
 report.validation.oversizedNoteEntries=oversizedNoteEntries
 assert.equal(report.validation.orphanContinuationPages,0)
 writeFileSync(join(staged,'layout-record.json'),JSON.stringify(report,null,2)+'\n')
 writeFileSync(join(temp,'unoutlined-pages.json'),JSON.stringify(pages))
 for(const [i,p]of pages.entries()) {
  await page.locator('#print-page').evaluate((host,markup)=>{host.innerHTML=markup},p.svg)
  // Save optional page previews for the user alongside the vector output.
  p.svg=await page.evaluate(()=>window.scorebook.outlinePage())
  assert(!/NaN|Infinity/.test(p.svg), `Outlined page ${i+1} contains invalid coordinates`)
  const outside=await page.evaluate(({pageWidth,pageHeight})=>[...document.querySelectorAll('#print-page path,#print-page line,#print-page circle')].filter(node=>{const b=node.getBoundingClientRect();return b.width&&b.height&&(b.left<-.5||b.right>pageWidth+.5||b.top<-.5||b.bottom>pageHeight+.5)}).map(node=>node.outerHTML.slice(0,160)),{pageWidth,pageHeight})
  assert.equal(outside.length,0,`Outlined page ${i+1} exceeds paper: ${JSON.stringify(outside.slice(0,3))}`)
  await page.locator('#print-page').screenshot({path:join(temp,'pages',`${String(i+1).padStart(3,'0')}.png`)})
  if(i%10===0)console.log(`Outline pages ${i+1}/${pages.length}`)
 }
 // Print already paginated vector SVGs; Chromium never scales individual pages to fit.
 const html=`<!doctype html><meta charset="utf-8"><title>${plan.title} · ${plan.edition}</title><style>@page{size:${pageWidth}px ${pageHeight}px;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}section{width:${pageWidth}px;height:${pageHeight}px;break-after:page;overflow:hidden}section:last-child{break-after:auto}section>svg{display:block;width:${pageWidth}px;height:${pageHeight}px}</style>${pages.map(p=>`<section>${p.svg}</section>`).join('')}`
 writeFileSync(join(temp,'print.html'),html)
 await page.setContent(html,{timeout:120000})
 await page.pdf({path:join(staged,pdfFile),width:`${pageWidth}px`,height:`${pageHeight}px`,printBackground:true,preferCSSPageSize:true,timeout:120000})
 const csv=['序号,编号,曲目,分类,分组,页码,版宽px,相对缩放%,适宽音符px,各页谱行数,排序依据,校阅备注,相比旧版音符大小%,旧版页码,行间留白px,相比第二版音符大小%,第二版页码',...records.map(e=>[e.order,e.id,e.title,plan.sections.find(s=>s.id===e.section).title,e.group,e.pages.join('/'),e.width,e.relativeScalePercent,e.screenNotePx,e.systemsPerPage.join('/'),e.reason,e.reviewNote,e.versusV1Percent,e.previousPages.join('/'),e.systemGap,e.versusV2Percent,e.secondEditionPages.join('/')].map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(','))].join('\n')
 writeFileSync(join(staged,'排序与缩放记录.csv'),'\uFEFF'+csv+'\n')
 let md=`# 简谱集排序与缩放记录\n\n${plan.edition}。收录 ${sourceFiles.length} 份原谱：${sourceFiles.length-1} 首乐曲，以及完整保留原顺序的《半音阶口琴基本功》每日训练，共 ${records.length} 个编号条目、${total} 页（含封面与目录 ${frontCount} 页）。\n\n按音乐风格、节奏、音域与练习目标组织曲目。\n\n默认版宽 ${plan.baseWidth}px 为 100%；数值越大，适宽显示的音符越小。页面采用 ${pageWidth}×${pageHeight} 的竖向比例，外边距 ${bodyX}px，谱内边距 ${profile.scoreMargin}px，谱行最小留白 ${profile.systemGap}px（旧版24px；密集连线按需要保留20—24px）。单页曲目在 520—960px 候选中优先选择能完整容纳的最小版宽，以便放大音符；很短的曲目保留适度留白，合页短曲统一字号，候选最小520px，合页默认不超过基准版宽，已确认组合可由各条目的 maximumSharedWidth 明确指定上限。所有正文谱页的自然占用高度必须严格高于正文区域的 ${minimumFillPercent}%；构建会拒绝低于或等于下限的分页与合页候选，封面和目录不参与此项约束。各段落分别采用分档等行高，普通谱行保持段内统一基础高度，房子谱行另用段内较高档；段落标题只在所在行占位，歌词按实际行数增加高度；${records[0].uniformSystemHeight?'每日训练也按段分别共享音乐高度，保留独立练习标题与原有换行':'每日训练保留独立练习间距'}。《土耳其进行曲》分 ${records.find(e=>e.id==='turkish_march').pages.length} 页，《Valsentino(快速圆舞曲)》分 ${records.find(e=>e.id==='valsentino').pages.length} 页，采用已验证的候选版宽，保持指定页数与正文高度下限；每日基本功按原谱整体分页。${plan.showCredits===false?'PDF 统一隐藏作词、作曲、编曲、演唱等右侧署名。':''}《欢乐颂》按条目设置隐藏低音谱表；原谱署名与低音内容仍保留。保留原谱的歌词、原有建议速度与音乐记号。相比旧版的百分比均按同一设备适宽显示计算，100%表示与对应版本相同；不是印刷字号。\n\n|序号|曲目 / 练习|页码|版宽 px|相对缩放|谱行分配|行间留白px|同屏音符 / 第一版|同屏音符 / 第二版|排序与学习重点|\n|---|---|---|---|---|---|---|---|---|---|\n`
 for(const section of plan.sections) {
  md+=`| |**${section.title}**| | | | | | | |${section.description}|\n`
  for(const e of records.filter(e=>e.section===section.id))md+=`|${String(e.order).padStart(3,'0')}|${e.title}|${e.pages.join('、')}|${e.width}|${e.relativeScalePercent}%|${e.systemsPerPage.join(' + ')}|${e.systemGap}|${e.versusV1Percent===null?'—':e.versusV1Percent+'%'}|${e.versusV2Percent===null?'—':e.versusV2Percent+'%'}|${e.reason}${e.reviewNote?'；'+e.reviewNote:''}|\n`
 }
 md+='\n每页项目位置与谱行范围见 `layout-record.json`；PDF 内容由用户亲自检查，反馈记录见 `逐页校阅.md`。后续可按编号或 PDF 页码提出调序、合页、字号与分页意见。\n'
 writeFileSync(join(staged,'排序与缩放记录.md'),md)
 report.validation.outlinedPages=total
 report.validation.outlinedPageOverflow=0
 writeFileSync(join(staged,'layout-record.json'),JSON.stringify(report,null,2)+'\n')
 for(const file of ['layout-record.json',pdfFile,'排序与缩放记录.csv','排序与缩放记录.md'])renameSync(join(staged,file),join(output,file))
 const reviewHtml='<!doctype html><meta charset="utf-8"><title>逐页校阅</title><style>body{background:#eee;font-family:serif}figure{display:inline-block;vertical-align:top;width:380px;margin:10px}img{width:100%;background:white}figcaption{padding:8px}</style>'+pages.map((p,i)=>`<figure><figcaption>第 ${i+1} 页 · ${p.kind}</figcaption><a href="pages/${String(i+1).padStart(3,'0')}.png"><img src="pages/${String(i+1).padStart(3,'0')}.png" loading="lazy"></a></figure>`).join('')
 writeFileSync(join(temp,'index.html'),reviewHtml)
 console.log(JSON.stringify({pages:total,entries:records.length,validation:report.validation}))
} finally {await browser.close()}

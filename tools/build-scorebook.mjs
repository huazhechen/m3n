import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { chromium } from '@playwright/test'
import { build } from 'vite'

const root = resolve(import.meta.dirname, '..')
const output = join(root, 'scorebook')
const temp = join(root, '.tmp/scorebook')
mkdirSync(temp, { recursive: true })
mkdirSync(join(temp,'pages'), { recursive: true })
const staged=join(temp,'staged');mkdirSync(staged,{recursive:true})
const plan = JSON.parse(readFileSync(join(output,'editorial-plan.json'),'utf8'))
const sourceFiles = readdirSync(join(root,'src/scores')).filter(f=>f.endsWith('.m3n')).sort()
assert.deepEqual([...new Set(plan.entries.map(e=>e.file))].sort(), sourceFiles, 'Every source must be included')
assert.equal(new Set(plan.entries.map(e=>e.id)).size,plan.entries.length,'Entry IDs must be unique')
const training = readFileSync(join(root,'src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n'),'utf8')
const matches = [...training.matchAll(/N: \{text=([^}]+)\}/g)]
const exercises = new Map(matches.map((m,i)=>[m[1],training.slice(m.index,matches[i+1]?.index??training.length)
  .replace(/\n===.*/g,'').replace(/\n---\s*\nN:\s*(?=\n|$)/g,'').trim().replace(/\n---\s*$/,'').trim()]))
const musicLines = source => source.split('\n').filter(line=>/^N:\s*\S/.test(line))
assert.deepEqual(musicLines([...exercises.values()].join('\n')),musicLines(training),'Exercise extraction preserves every music line')
assert.deepEqual(plan.entries.filter(e=>e.practice).map(e=>e.practice).sort(), [...exercises.keys()].sort(), 'Every exercise exactly once')
for(const entry of plan.entries) {
  assert(entry.width>=760&&entry.width<=940,'Keep note sizes close to the base width')
  entry.source=entry.practice?`{title=${entry.title}}\n{key=C} {4/4} {60qpm}\n${exercises.get(entry.practice)}`:readFileSync(join(root,'src/scores',entry.file),'utf8')
  entry.sourceSha256=createHash('sha256').update(entry.source).digest('hex')
}
await build({configFile:false,logLevel:'error',build:{outDir:join(temp,'bundle'),emptyOutDir:true,minify:false,
  lib:{entry:join(root,'tools/scorebook-layout.mjs'),name:'scorebook',formats:['iife'],fileName:()=>'bundle.js'}}})
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||['/usr/bin/chromium','/usr/sbin/chromium','/usr/bin/chromium-browser'].find(existsSync),headless:true})
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const svgText=(text,x,y,size=14,attrs='')=>`<text x="${x}" y="${y}" font-size="${size}" font-family="Scorebook Text" ${attrs}>${escape(text)}</text>`
const bodyWidth=704, bodyTop=90, bodyBottom=1055, bodyHeight=bodyBottom-bodyTop
const renderScale=width=>bodyWidth/width
function paginate(layout,entry) {
 const cuts=layout.cuts, n=layout.rows, scale=renderScale(layout.width)
 const cap=bodyHeight/scale
 if(entry.pageBreaks?.length) {
  const ends=[...entry.pageBreaks,n], ranges=[];let start=0
  for(const end of ends) {assert(end>start&&end<=n); assert(cuts[end]-cuts[start]<=cap-(start?36:0),'Manual page overflows');ranges.push([start,end]);start=end}
  return ranges
 }
 // Balanced dynamic programming over whole systems. Continuations contain at least 3 systems.
 const memo=new Map()
 function solve(start) {
  if(start===n)return {cost:0,ranges:[]}
  if(memo.has(start))return memo.get(start)
  let best=null
  for(let end=start+1;end<=n;end++) {
   const used=cuts[end]-cuts[start]+(start?36:0)
   if(used>cap)break
   if(start>0&&end-start<3)continue
   const next=solve(end);if(!next)continue
   const slack=(cap-used)/cap
   const cost=100+slack*slack*10+next.cost
   if(!best||cost<best.cost)best={cost,ranges:[[start,end],...next.ranges]}
  }
  memo.set(start,best);return best
 }
 const result=solve(0)
 if(!result)throw new Error(`Cannot paginate ${entry.title} at ${layout.width}`)
 return result.ranges
}
function candidateCost(layout,ranges,width,preferred) {
 const s=renderScale(width)
 return ranges.length*1000 + Math.abs(width-preferred)*0.6 + ranges.reduce((sum,[a,b])=>sum+((bodyHeight-(layout.cuts[b]-layout.cuts[a]+(a?36:0))*s)/bodyHeight)**2,0)*20
}
try {
 const page=await browser.newPage({viewport:{width:1000,height:1200},deviceScaleFactor:1})
 await page.route('**/*',route=>route.request().url().endsWith('/fonts/NotoSerifCJKsc-Regular.otf')
  ?route.fulfill({path:join(root,'public/fonts/NotoSerifCJKsc-Regular.otf'),contentType:'font/otf'})
  :route.fulfill({contentType:'text/html',body:'<!doctype html><title>Offline scorebook</title>'}))
 await page.goto('http://scorebook.local/')
 await page.setContent('<style>body{margin:0} #scratch{position:absolute;left:-20000px} #print-page{width:794px;background:white}</style><div id="scratch"></div><main id="print-page"></main>')
 await page.addScriptTag({path:join(temp,'bundle/bundle.js')})
 await page.evaluate(font=>window.scorebook.prepare(font),readFileSync(join(root,'public/fonts/NotoSerifCJKsc-Regular.otf')).toString('base64'))
 const cacheFolder=join(temp,'cache');mkdirSync(cacheFolder,{recursive:true})
 const rendererHash=createHash('sha256').update(readFileSync(join(temp,'bundle/bundle.js'))).update(readFileSync(join(root,'public/fonts/NotoSerifCJKsc-Regular.otf'))).digest('hex')
 const measured=[]
 for(const [i,entry] of plan.entries.entries()) {
  let best
  const summaries=[]
  for(const width of entry.widthLocked?[entry.width]:[...new Set([entry.width,...plan.widthCandidates])]) {
   const key=createHash('sha256').update(rendererHash+entry.source+width).digest('hex'),cachePath=join(cacheFolder,key+'.json')
   const layout=existsSync(cachePath)?JSON.parse(readFileSync(cachePath,'utf8')):await page.evaluate(({source,width})=>window.scorebook.measure(source,width),{source:entry.source,width})
   writeFileSync(cachePath,JSON.stringify(layout))
   assert.equal(layout.outside.length,0,`${entry.title}: outside page at ${width}`)
   assert.equal(layout.overlaps.length,0,`${entry.title}: overlapping lyrics or notes at ${width} ${JSON.stringify(layout.overlaps.slice(0,3))}`)
   assert.equal(layout.clipped.length,0,`${entry.title}: unsafe system cuts at ${width} ${JSON.stringify(layout.clipped)}`)
   const ranges=paginate(layout,entry),cost=candidateCost(layout,ranges,width,entry.width)
   summaries.push({width,rows:layout.rows,pages:ranges.length,cost:Number(cost.toFixed(2))})
   if(!best||cost<best.cost)best={...layout,ranges,cost}
  }
  measured.push({...entry,layout:best,candidates:summaries})
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
   const heights=group.map(e=>e.layout.height*renderScale(e.layout.width)),memo=new Map()
   function pack(start) {
    if(start===group.length)return {cost:0,ranges:[]}
    if(memo.has(start))return memo.get(start)
    let best=null,used=0
    for(let end=start+1;end<=group.length;end++) {
     used+=heights[end-1]+(end>start+1?30:0);if(used>bodyHeight)break
     const next=pack(end),cost=1000+((bodyHeight-used)/bodyHeight)**2*100+next.cost
     if(!best||cost<best.cost)best={cost,ranges:[[start,end],...next.ranges]}
    }
    memo.set(start,best);return best
   }
   for(const [a,b] of pack(0).ranges) {
    const target={section:entry.section,items:[],used:0};musicPages.push(target)
    for(let k=a;k<b;k++) {const e=group[k],l=e.layout,y=target.used+(k>a?30:0),height=heights[k];target.items.push({entry:e,start:0,end:l.rows,index:0,y,height,cropTop:0,cropBottom:l.height});target.used=y+height}
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
 // Four contents pages keep every item easy to locate, including extracted exercises.
 const tocItems=plan.sections.flatMap(section=>[{section},...measured.filter(e=>e.section===section.id).map(entry=>({entry}))])
 const tocRows=32, tocCount=Math.ceil(tocItems.length/tocRows), frontCount=1+tocCount
 const entryPages=new Map()
 for(const [index,p] of musicPages.entries()) for(const item of p.items) {
  const pages=entryPages.get(item.entry.id)??[];pages.push(frontCount+index+1);entryPages.set(item.entry.id,pages)
 }
 const total=frontCount+musicPages.length
 const footer=num=>`<line x1="56" y1="1075" x2="738" y2="1075" stroke="#bbb" stroke-width=".6"/>${svgText('循序渐进简谱集 · 第一版',56,1097,11,'fill="#666"')}${svgText(String(num),738,1097,12,'text-anchor="end" fill="#666"')}`
 const pageSvg=(content,num)=>`<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123"><rect width="794" height="1123" fill="white"/>${content}${footer(num)}</svg>`
 const pages=[]
 let cover=svgText('循序渐进',74,250,58)+svgText('简谱集',74,333,72)+`<line x1="78" y1="375" x2="340" y2="375" stroke="#333" stroke-width="2"/>`
 cover+=svgText('基础练习 · 民歌经典 · 流行歌曲 · 影视与器乐',78,426,18)
 cover+=svgText('82 份原始曲谱 · 81 首乐曲与 28 项分级练习',78,468,16)
 cover+=svgText('第一版 · 供校阅与后续微调',78,506,16)
 for(const [i,section] of plan.sections.entries())cover+=svgText(section.title,78,620+i*43,18)
 cover+=svgText('A4 纵向 · 保留原谱歌词、低音与音乐记号',78,937,14)+svgText('难度 1—5 为本谱集当前简谱编配的相对等级。',78,967,14)+svgText('短曲按难度与风格合页；长曲按完整谱行均衡分页。',78,997,14)
 pages.push({kind:'cover',svg:pageSvg(cover,1)})
 for(let t=0;t<tocCount;t++) {
  let content=svgText('目录',56,70,30)+svgText(`${t+1} / ${tocCount}`,738,68,14,'text-anchor="end"')
  content+=svgText('编号  曲目 / 练习',56,110,13,'fill="#666"')+svgText('难度',635,110,13,'fill="#666"')+svgText('页码',738,110,13,'text-anchor="end" fill="#666"')
  const rows=tocItems.slice(t*tocRows,(t+1)*tocRows)
  for(const [j,row]of rows.entries()) {
   if(row.section){content+=svgText(row.section.title,56,139+j*28,16,'font-weight="700"');continue}
   const e=row.entry
   const y=139+j*28,nums=entryPages.get(e.id),label=nums.length===1?nums[0]:`${nums[0]}–${nums.at(-1)}`
   content+=svgText(`${String(measured.indexOf(e)+1).padStart(3,'0')}  ${e.title}`,56,y,15)+svgText(String(e.difficulty),648,y,14)+svgText(label,738,y,14,'text-anchor="end"')
  }
  pages.push({kind:'contents',svg:pageSvg(content,t+2)})
 }
 for(const [i,p]of musicPages.entries()) {
  const num=frontCount+i+1,section=plan.sections.find(s=>s.id===p.section)
  let content=svgText(section.title,56,39,13,'fill="#555"')+svgText('简谱',738,39,12,'text-anchor="end" fill="#555"')+'<line x1="56" y1="53" x2="738" y2="53" stroke="#bbb" stroke-width=".6"/>'
  for(const item of p.items) {
   const {entry:e,start,end,y,cropTop,cropBottom}=item,l=e.layout,s=renderScale(l.width)
   const label=`${String(measured.indexOf(e)+1).padStart(3,'0')} · 难度 ${e.difficulty} · ${e.group}`
   content+=svgText(label,72,bodyTop+y-8,11,'fill="#666"')
   if(start)content+=svgText(`${e.title}（续）`,72,bodyTop+y+22*s,20)
   const markup=l.markup.replace(/<svg[^>]*>/,`<svg x="45" y="${bodyTop+y+(start?36*s:0)}" width="704" height="${(cropBottom-cropTop)*s}" viewBox="0 ${cropTop} ${l.width} ${cropBottom-cropTop}" overflow="hidden">`)
   content+=markup
   assert(end>start)
  }
  pages.push({kind:'music',svg:pageSvg(content,num)})
 }
 const records=measured.map((e,i)=>({order:i+1,id:e.id,title:e.title,file:e.file,practice:e.practice,section:e.section,group:e.group,difficulty:e.difficulty,reason:e.reason,width:e.layout.width,relativeScalePercent:Number((plan.baseWidth/e.layout.width*100).toFixed(2)),noteSizePt:Number((22*(bodyWidth/794*210)/e.layout.width*72/25.4).toFixed(2)),pages:entryPages.get(e.id),systems:e.layout.rows,systemsPerPage:e.layout.ranges.map(([a,b])=>b-a),sourceSha256:e.sourceSha256,candidates:e.candidates,reviewNote:e.reviewNote}))
 const pageRecords=musicPages.map((p,i)=>({page:frontCount+i+1,section:p.section,fillPercent:Number((p.used/bodyHeight*100).toFixed(1)),items:p.items.map(item=>({id:item.entry.id,title:item.entry.title,systems:[item.start+1,item.end],width:item.entry.layout.width,top:Number(item.y.toFixed(2)),height:Number(item.height.toFixed(2))}))}))
 const report={title:plan.title,edition:plan.edition,rendererSha256:rendererHash,sourceCount:sourceFiles.length,entryCount:records.length,pageCount:total,frontPages:frontCount,baseWidth:plan.baseWidth,body:{width:bodyWidth,height:bodyHeight},entries:records,pages:pageRecords,validation:{sourceCoverage:true,exerciseCoverage:true,geometryCandidates:records.reduce((s,e)=>s+e.candidates.length,0),outside:0,overlaps:0,unsafeCuts:0,orphanContinuationPages:pageRecords.flatMap(p=>p.items).filter(item=>item.systems[0]>1&&item.systems[1]-item.systems[0]+1<3).length}}
 assert.equal(report.validation.orphanContinuationPages,0)
 writeFileSync(join(staged,'layout-record.json'),JSON.stringify(report,null,2)+'\n')
 writeFileSync(join(temp,'unoutlined-pages.json'),JSON.stringify(pages))
 for(const [i,p]of pages.entries()) {
  await page.locator('#print-page').evaluate((host,markup)=>{host.innerHTML=markup},p.svg)
  // All pages are saved for an actual page-by-page visual review.
  p.svg=await page.evaluate(()=>window.scorebook.outlinePage())
  const outside=await page.evaluate(()=>[...document.querySelectorAll('#print-page path,#print-page line,#print-page circle')].filter(node=>{const b=node.getBoundingClientRect();return b.width&&b.height&&(b.left<-.5||b.right>794.5||b.top<-.5||b.bottom>1123.5)}).map(node=>node.outerHTML.slice(0,160)))
  assert.equal(outside.length,0,`Outlined page ${i+1} exceeds paper: ${JSON.stringify(outside.slice(0,3))}`)
  await page.locator('#print-page').screenshot({path:join(temp,'pages',`${String(i+1).padStart(3,'0')}.png`)})
  if(i%10===0)console.log(`Outline / review pages ${i+1}/${pages.length}`)
 }
 // Print already paginated vector SVGs; Chromium never scales individual pages to fit.
 const html=`<!doctype html><meta charset="utf-8"><title>${plan.title} · ${plan.edition}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}section{width:210mm;height:297mm;break-after:page;overflow:hidden}section:last-child{break-after:auto}section>svg{display:block;width:210mm;height:297mm}</style>${pages.map(p=>`<section>${p.svg}</section>`).join('')}`
 writeFileSync(join(temp,'print.html'),html)
 await page.setContent(html,{timeout:120000})
 await page.pdf({path:join(staged,'循序渐进简谱集-v1.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true,timeout:120000})
 const csv=['序号,编号,曲目,分类,分组,难度,页码,版宽px,相对缩放%,音符字号pt,各页谱行数,排序依据,校阅备注',...records.map(e=>[e.order,e.id,e.title,plan.sections.find(s=>s.id===e.section).title,e.group,e.difficulty,e.pages.join('/'),e.width,e.relativeScalePercent,e.noteSizePt,e.systemsPerPage.join('/'),e.reason,e.reviewNote].map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(','))].join('\n')
 writeFileSync(join(staged,'排序与缩放记录.csv'),'\uFEFF'+csv+'\n')
 let md=`# 简谱集排序与缩放记录\n\n${plan.edition}。收录 ${sourceFiles.length} 份原谱：81 首乐曲，以及从《半音阶口琴基本功》完整拆出的 28 项练习，共 ${records.length} 个编号条目、${total} 页（含封面与目录 ${frontCount} 页）。\n\n按当前简谱编配的节奏、音域、临时变音、连音组、装饰、变拍和反复复杂度评为 1—5 级；这是编辑分级，不是考级等级。分类内优先兼顾风格与学习目标，再按难度推进。\n\n默认版宽 ${plan.baseWidth}px 为 100%；数值越大，印刷音符越小。所有页使用固定 A4 纸张与统一版心，不按内容高度再次缩放。保留原谱的歌词、低音、原有建议速度与音乐记号。\n\n|序号|曲目 / 练习|难度|页码|版宽 px|相对缩放|谱行分配|排序与学习重点|\n|---|---|---|---|---|---|---|---|\n`
 for(const section of plan.sections) {
  md+=`| |**${section.title}**| | | | | |${section.description}|\n`
  for(const e of records.filter(e=>e.section===section.id))md+=`|${String(e.order).padStart(3,'0')}|${e.title}|${e.difficulty}|${e.pages.join('、')}|${e.width}|${e.relativeScalePercent}%|${e.systemsPerPage.join(' + ')}|${e.reason}${e.reviewNote?'；'+e.reviewNote:''}|\n`
 }
 md+='\n每页项目位置与谱行范围见 `layout-record.json`；逐页人工校阅结论见 `逐页校阅.md`。后续可按编号或 PDF 页码提出调序、合页、字号与分页意见。\n'
 writeFileSync(join(staged,'排序与缩放记录.md'),md)
 report.validation.outlinedPages=total
 report.validation.outlinedPageOverflow=0
 writeFileSync(join(staged,'layout-record.json'),JSON.stringify(report,null,2)+'\n')
 for(const file of ['layout-record.json','循序渐进简谱集-v1.pdf','排序与缩放记录.csv','排序与缩放记录.md'])renameSync(join(staged,file),join(output,file))
 const reviewHtml='<!doctype html><meta charset="utf-8"><title>逐页校阅</title><style>body{background:#eee;font-family:serif}figure{display:inline-block;vertical-align:top;width:380px;margin:10px}img{width:100%;background:white}figcaption{padding:8px}</style>'+pages.map((p,i)=>`<figure><figcaption>第 ${i+1} 页 · ${p.kind}</figcaption><a href="pages/${String(i+1).padStart(3,'0')}.png"><img src="pages/${String(i+1).padStart(3,'0')}.png" loading="lazy"></a></figure>`).join('')
 writeFileSync(join(temp,'index.html'),reviewHtml)
 console.log(JSON.stringify({pages:total,entries:records.length,validation:report.validation}))
} finally {await browser.close()}

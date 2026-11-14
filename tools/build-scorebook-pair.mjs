import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { chromium } from '@playwright/test'
import { paginateScorebookLayout, validatePairedScorebookPagination } from './scorebook-pagination.mjs'

const root=resolve(import.meta.dirname,'..'), output=join(root,'scorebook')
const read=file=>JSON.parse(readFileSync(file,'utf8'))
const plan=read(join(output,'editorial-plan.json'))
const run=file=>execFileSync(process.execPath,[join(root,'tools/build-scorebook.mjs'),`--plan=${file}`],{stdio:'inherit',cwd:root})
if(!plan.paired){run(join(output,'editorial-plan.json'));process.exit(0)}
const reference=read(join(output,plan.fixedPaginationFrom)), byId=new Map(reference.entries.map(e=>[e.id,e]))
assert.equal(reference.pageCount,87,'Both editions retain the 87-page numbered edition')
const settings=plan.paired, staff=structuredClone(plan)
delete staff.paired
Object.assign(staff,{outputPdf:settings.staffPdf,outputKey:'scorebook-v40-staff',notationLabel:'五线谱版',recordFile:'staff-layout-record.json',sizeReportFile:'五线谱PDF体积记录.json',sortCsvFile:'五线谱排序与缩放记录.csv',sortMarkdownFile:'五线谱排序与缩放记录.md'})
const temp=join(root,'.tmp',staff.outputKey), cache=join(temp,'calibration-cache')
mkdirSync(cache,{recursive:true})
await build({configFile:false,logLevel:'error',define:{'import.meta.url':JSON.stringify('http://scorebook.local/bundle.js')},build:{outDir:join(temp,'calibration'),emptyOutDir:true,minify:false,lib:{entry:join(root,'tools/scorebook-layout.mjs'),name:'scorebook',formats:['iife'],fileName:()=> 'bundle.js'}}})
const rendererHash=createHash('sha256').update(readFileSync(join(temp,'calibration/bundle.js'))).update(readFileSync(join(root,'public/fonts/NotoSerifCJKsc-Regular.otf'))).digest('hex')
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||['/usr/bin/chromium','/usr/sbin/chromium','/usr/bin/chromium-browser'].find(existsSync),headless:true})
try {
 const page=await browser.newPage({viewport:{width:1000,height:1200}})
 await page.route('**/*',route=>route.request().url().endsWith('/bundle.js')?route.fulfill({path:join(temp,'calibration/bundle.js'),contentType:'application/javascript; charset=utf-8'}):route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}#scratch{position:absolute;left:-20000px}</style><div id="scratch"></div>'}))
 await page.goto('http://scorebook.local/');await page.addScriptTag({url:'http://scorebook.local/bundle.js'})
 await page.evaluate(font=>window.scorebook.prepare(font),readFileSync(join(root,'public/fonts/NotoSerifCJKsc-Regular.otf')).toString('base64'))
 const width=plan.page.width-2*plan.page.outerMargin, height=plan.page.bodyBottom-plan.page.bodyTop
 for(const entry of staff.entries){
  const old=byId.get(entry.id)
  Object.assign(entry,{notation:'staff',width,widthLocked:true,pageCount:old.pages.length,systemGap:settings.systemGap,systemGapCandidates:[settings.systemGap],staffEngraving:settings.engraving,staffLineColor:settings.staffLineColor,reviewNote:'与简谱版起止页码一致；逐曲选择能够安全容纳的最大五线谱比例。'})
  delete entry.pageBreaks
 }
 const groups=[]
 for(const entry of staff.entries){
  const previous=groups.at(-1), old=byId.get(entry.id)
  if(entry.sharePage&&previous?.[0].sharePage&&old.pages.length===1&&byId.get(previous[0].id).pages[0]===old.pages[0])previous.push(entry)
  else groups.push([entry])
 }
 for(const group of groups){
  async function trial(scale){
   const layouts=[]
   for(const entry of group){
    const source=readFileSync(join(root,'src/scores',entry.file),'utf8')
    const options={notation:'staff',showCredits:plan.showCredits??true,includeBass:entry.includeBass??true,staffScale:scale,staffEngraving:settings.engraving,staffLineColor:settings.staffLineColor,systemGap:settings.systemGap}
    const key=createHash('sha256').update(rendererHash+source+JSON.stringify(options)+width).digest('hex'), file=join(cache,key+'.json')
    let layout=existsSync(file)?read(file):null
    if(!layout){
     layout=await page.evaluate(async ({source,width,options})=>{
      try{const l=await window.scorebook.measure(source,width,options);delete l.markup;return l}catch(error){return {renderError:error.message}}
     },{source,width,options})
     writeFileSync(file,JSON.stringify(layout))
    }
    if(layout.renderError||layout.diagnostics?.some(d=>d.severity==='error')||layout.outside.length||layout.overlaps.length||layout.clipped.length)return null
    const ranges=paginateScorebookLayout(layout,{...entry,pageCount:byId.get(entry.id).pages.length},{bodyHeight:height,scale:1})
    if(!ranges)return null
    layouts.push({...layout,ranges})
   }
   if(group.length>1&&layouts.reduce((sum,l)=>sum+l.height,0)+(group.length-1)*plan.page.shortWorkGap>height)return null
   return layouts
  }
  let low=0,high=Math.floor((settings.maximumScale-settings.minimumScale)/settings.scaleStep),best
  while(low<=high){
   const middle=Math.floor((low+high)/2),scale=settings.minimumScale+middle*settings.scaleStep
   const layouts=await trial(scale)
   if(layouts){best={scale,layouts};low=middle+1}else high=middle-1
  }
  assert(best,`No safe staff layout in the fixed pages: ${group.map(e=>e.title).join(' / ')}`)
  for(const entry of group)entry.staffScale=best.scale
  console.log(`Staff calibration ${group.map(e=>e.title).join(' / ')}: ${best.scale}%, pages ${byId.get(group[0].id).pages.join('/')}`)
 }
} finally {await browser.close()}
const staffPlan=join(output,settings.staffPlanFile);writeFileSync(staffPlan,JSON.stringify(staff,null,2)+'\n')
run(join(output,'editorial-plan.json'))
run(staffPlan)
const numbered=read(join(output,'layout-record.json')), rendered=read(join(output,staff.recordFile))
validatePairedScorebookPagination(numbered,rendered)
const agreement=numbered.entries.map(entry=>{
 const other=rendered.entries.find(e=>e.id===entry.id)
 assert.deepEqual(entry.pages,other.pages,entry.title)
 assert.equal(entry.sourceSha256,other.sourceSha256,entry.title)
 return {id:entry.id,title:entry.title,pages:entry.pages,staffScale:other.staffScale,staffHeightPx:other.staffHeightPx}
})
writeFileSync(join(output,'paired-layout-record.json'),JSON.stringify({edition:plan.edition,pageCount:numbered.pageCount,numberedPdf:plan.outputPdf,staffPdf:staff.outputPdf,matchingEntries:agreement.length,entries:agreement},null,2)+'\n')
console.log(`Both editions: ${numbered.pageCount} pages; ${agreement.length} matching page ranges`)

import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {existsSync,mkdirSync,readFileSync,readdirSync,renameSync,writeFileSync} from 'node:fs'
import {cpus} from 'node:os'
import {dirname,join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
import {build} from 'vite'
import {chromium} from '@playwright/test'
import {chooseBestWidth,widthCandidates,widthSearchStrategy} from './scorebook-width.mjs'
import {staffBenchmarkInstrumentation} from './lib/staff-benchmark-instrumentation.mjs'

const root=resolve(import.meta.dirname,'..')
const argument=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)
const instrument=process.argv.includes('--instrument'),profile=process.argv.includes('--profile')
assert(!(instrument&&profile),'Keep CPU sampling separate from diagnostic instrumentation')
const allowed=/^--(?:instrument|profile|output=.+|limit=\d+|score=.+|scope=(?:all|scores))$/
assert(process.argv.slice(2).every(arg=>allowed.test(arg)),'Unknown benchmark argument')
const output=resolve(argument('output')??'.tmp/staff-baseline/report.json'),temp=join(dirname(output),'bundle-'+(instrument?'instrumented':'production'))
mkdirSync(dirname(output),{recursive:true})
const hash=value=>createHash('sha256').update(value).digest('hex')
const scopes=argument('scope')==='scores'?['scores']:['scores','works']
const inputs=scopes.flatMap(scope=>readdirSync(join(root,'src',scope)).filter(file=>file.endsWith('.m3n')).sort().map(name=>{
 const file=`${scope}/${name}`,source=readFileSync(join(root,'src',file),'utf8')
 return {file,source,sourceSha256:hash(source)}
})).filter(input=>!argument('score')||argument('score').split(',').some(part=>input.file.includes(part))).slice(0,argument('limit')?Number(argument('limit')):Infinity)
assert(inputs.length,'No scores selected')
const started=performance.now()
await build({configFile:false,logLevel:'error',base:'/',plugins:instrument?[staffBenchmarkInstrumentation()]:[],
 define:{'import.meta.url':JSON.stringify('http://staff-benchmark.local/bundle.js')},build:{outDir:temp,emptyOutDir:true,minify:false,
 lib:{entry:join(root,'tools/staff-width-layout.mjs'),name:'staffWidths',formats:['iife'],fileName:()=>'bundle.js'}}})
const bundleMs=performance.now()-started
const report={revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
 sourceSnapshotSha256:hash(JSON.stringify(inputs.map(({file,sourceSha256})=>({file,sourceSha256})))),
 rendererSha256:hash(readFileSync(join(temp,'bundle.js'))),mode:instrument?'instrumented':profile?'cpu-profile':'production',
 strategy:widthSearchStrategy,widths:widthCandidates,auditLayout:false,freshBrowserPerScore:true,
 environment:{node:process.version,cpu:cpus()[0]?.model},bundleMs,entries:[]}
const save=()=>{
 report.scoreWallMs=report.entries.reduce((n,e)=>n+e.measurement.wallMs,0)
 report.browserSearchMs=report.entries.reduce((n,e)=>n+e.measurement.browserSearchMs,0)
 report.browserSetupMs=report.entries.reduce((n,e)=>n+e.browserSetupMs,0)
 report.candidateCount=report.entries.reduce((n,e)=>n+e.candidates.length,0)
 report.failedCandidates=report.entries.flatMap(e=>e.candidates).filter(c=>c.error||!c.pageCount).length
 report.totalMs=performance.now()-started
 writeFileSync(output+'.tmp',JSON.stringify(report,null,2)+'\n');renameSync(output+'.tmp',output)
}
const executablePath=process.env.CHROMIUM_PATH||['/usr/bin/chromium','/usr/sbin/chromium','/usr/bin/chromium-browser'].find(existsSync)
for(const [index,input]of inputs.entries()){
 const setupStarted=performance.now(),browser=await chromium.launch({executablePath,headless:true})
 try{
  const page=await browser.newPage()
  await page.route('http://staff-benchmark.local/**',route=>{
   const pathname=new URL(route.request().url()).pathname
   if(pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html style="font-synthesis:none;text-rendering:optimizeLegibility"><body></body></html>'})
   const path=resolve(temp,'.'+pathname)
   if(!path.startsWith(temp+'/')||!existsSync(path))return route.abort()
   return route.fulfill({path,contentType:'application/javascript; charset=utf-8'})
  })
  await page.goto('http://staff-benchmark.local/')
  await page.addScriptTag({url:'http://staff-benchmark.local/bundle.js'})
  await page.evaluate(()=>window.staffWidths.prepare())
  if(instrument)await page.evaluate(()=>{
   const original=CanvasRenderingContext2D.prototype.measureText
   CanvasRenderingContext2D.prototype.measureText=function(...args){
    const record=globalThis.__staffBenchmark
    if(record)record.canvasMeasureCalls=(record.canvasMeasureCalls??0)+1
    return original.apply(this,args)
   }
  })
  const browserSetupMs=performance.now()-setupStarted
  let cdp
  if(profile){cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start')}
  const measuredAt=performance.now()
  const result=await page.evaluate(async({source,instrument})=>{
   if(instrument)globalThis.__staffBenchmark={}
   const started=performance.now()
   const result=await window.staffWidths.search(source)
   return {...result,browserSearchMs:performance.now()-started,diagnostics:globalThis.__staffBenchmark}
  },{source:input.source,instrument})
  const wallMs=performance.now()-measuredAt
  if(cdp){const {profile:data}=await cdp.send('Profiler.stop');const folder=join(dirname(output),'profiles');mkdirSync(folder,{recursive:true});writeFileSync(join(folder,input.file.replaceAll('/','--')+'.cpuprofile'),JSON.stringify(data))}
  const best=chooseBestWidth(result.candidates)
  report.entries.push({file:input.file,sourceSha256:input.sourceSha256,width:best?.width??null,pageCount:best?.pageCount??null,
   candidates:result.candidates,renderCache:result.renderCache,browserSetupMs,measurement:{wallMs,browserSearchMs:result.browserSearchMs,reused:false},diagnostics:result.diagnostics})
  save()
  console.log(`${index+1}/${inputs.length} ${input.file}: ${best?.width??'FAILED'}px, ${(wallMs/1000).toFixed(3)}s`)
 }finally{await browser.close()}
}
report.complete=true;save()
console.log(JSON.stringify({scores:report.entries.length,candidates:report.candidateCount,failedCandidates:report.failedCandidates,scoreWallSeconds:report.scoreWallMs/1000,totalSeconds:report.totalMs/1000,output}))

import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'

const argument=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)
const files=process.argv.slice(2).filter(value=>!value.startsWith('--'))
assert(files.length,'Pass production baseline JSON reports')
const read=file=>JSON.parse(readFileSync(resolve(file),'utf8'))
const baselines=files.map(read)
const semantic=report=>report.entries.map(entry=>({file:entry.file,sourceSha256:entry.sourceSha256,width:entry.width,pageCount:entry.pageCount,
 candidates:entry.candidates.map(({timings:_timings,...candidate})=>candidate)}))
const reference=semantic(baselines[0])
for(const report of baselines){
 assert(report.complete,'Incomplete baseline')
 assert.equal(report.mode,'production')
 assert.equal(report.auditLayout,false)
 assert.equal(report.sourceSnapshotSha256,baselines[0].sourceSnapshotSha256)
 if(!process.argv.includes('--compare-implementations'))assert.equal(report.rendererSha256,baselines[0].rendererSha256)
 assert.deepEqual(semantic(report),reference,'Every candidate must remain identical between runs')
}
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2}
const layoutMs=report=>report.entries.flatMap(e=>e.candidates).reduce((n,c)=>n+(c.timings?.layoutMs??0),0)
const summary={comparisonAcrossImplementations:process.argv.includes('--compare-implementations'),revision:baselines[0].revision,sourceSnapshotSha256:baselines[0].sourceSnapshotSha256,
 candidateResultsSha256:createHash('sha256').update(JSON.stringify(reference)).digest('hex'),scores:reference.length,
 libraryScores:reference.filter(e=>e.file.startsWith('scores/')).length,works:reference.filter(e=>e.file.startsWith('works/')).length,
 candidates:baselines[0].candidateCount,failedCandidates:baselines[0].failedCandidates,
 identicalCandidates:true,runs:baselines.map((r,i)=>({file:files[i],scoreWallMs:r.scoreWallMs,browserSearchMs:r.browserSearchMs,layoutMs:layoutMs(r),browserSetupMs:r.browserSetupMs,totalMs:r.totalMs})),
 medianScoreWallMs:median(baselines.map(r=>r.scoreWallMs)),medianBrowserSearchMs:median(baselines.map(r=>r.browserSearchMs)),
 medianLayoutMs:median(baselines.map(layoutMs)),medianTotalMs:median(baselines.map(r=>r.totalMs)),
 slowest:reference.map((e,i)=>({file:e.file,medianMs:median(baselines.map(r=>r.entries[i].measurement.wallMs))})).sort((a,b)=>b.medianMs-a.medianMs).slice(0,10)}
if(argument('instrument')){
 const diagnostic=read(argument('instrument'))
 assert.equal(diagnostic.mode,'instrumented');assert(diagnostic.complete)
 assert.deepEqual(semantic(diagnostic),reference,'Diagnostic instrumentation must preserve every candidate')
 const totals={}
 for(const entry of diagnostic.entries)for(const [key,value]of Object.entries(entry.diagnostics??{}))totals[key]=(totals[key]??0)+value
 summary.instrumentation={scoreWallMs:diagnostic.scoreWallMs,totals,parentTimingsIncludeChildren:true}
}
if(argument('profile')){
 const report=read(argument('profile'));assert.equal(report.mode,'cpu-profile');assert(report.complete)
 const selected=new Set(report.entries.map(entry=>entry.file))
 assert.equal(selected.size,report.entries.length,'Duplicate profile score')
 assert.deepEqual(semantic(report),reference.filter(entry=>selected.has(entry.file)),'CPU sampling must preserve every sampled candidate')
 const self=new Map(),inclusive=new Map();let samples=0,totalUs=0
 for(const entry of report.entries){
  const profile=read(join(dirname(resolve(argument('profile'))),'profiles',entry.file.replaceAll('/','--')+'.cpuprofile'))
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map()
  for(const node of nodes.values())for(const child of node.children??[])parents.set(child,node.id)
  const key=id=>{const f=nodes.get(id).callFrame;return `${f.functionName||'(anonymous)'}:${f.lineNumber+1}:${f.columnNumber+1}`}
  for(let i=0;i<(profile.samples?.length??0);i++){
   const id=profile.samples[i],duration=profile.timeDeltas[i];samples++;totalUs+=duration
   const label=key(id);self.set(label,(self.get(label)??0)+duration)
   const seen=new Set()
   for(let at=id;at!==undefined;at=parents.get(at)){const label=key(at);if(!seen.has(label)){inclusive.set(label,(inclusive.get(label)??0)+duration);seen.add(label)}}
  }
 }
 const top=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,60).map(([frame,us])=>({frame,seconds:us/1e6,percent:us/totalUs*100}))
 summary.profile={scores:report.entries.map(entry=>entry.file),subset:report.entries.length!==reference.length,samples,totalSeconds:totalUs/1e6,self:top(self),inclusive:top(inclusive),parentTimingsIncludeChildren:true}
}
const output=argument('output')
if(output)writeFileSync(resolve(output),JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify(summary,null,2))

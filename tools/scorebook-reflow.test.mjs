import test from 'node:test'
import assert from 'node:assert/strict'
import {reflowScorebookLayout,reflowRatios} from './scorebook-reflow.mjs'
const original={rows:10,width:590,systemGap:18,systemDensities:[0.8,1.5]}
test('uses spare page capacity to relieve a dense line at the same music size',async()=>{
 const better={...original,rows:11,systemDensities:[0.9,1.2]}
 const result=await reflowScorebookLayout(original,{measure:async()=>better,fits:()=>true})
 assert.equal(result,better);assert.equal(result.width,original.width);assert.equal(result.systemGap,original.systemGap)
})
test('rejects reflow that overflows the existing pages or adds too many rows',async()=>{
 const better={...original,rows:11,systemDensities:[1]}
 assert.equal(await reflowScorebookLayout(original,{measure:async()=>better,fits:()=>false}),original)
 assert.equal(await reflowScorebookLayout(original,{measure:async()=>({...better,rows:12}),fits:()=>true}),original)
})
test('keeps comfortable scores and insignificant density changes unchanged',async()=>{
 const comfortable={...original,systemDensities:[0.7,0.8]}
 assert.equal(await reflowScorebookLayout(comfortable,{measure:()=>{throw Error('unneeded render')},fits:()=>true}),comfortable)
 assert.equal(await reflowScorebookLayout(original,{measure:async()=>({...original,rows:11,systemDensities:[1.48]}),fits:()=>true}),original)
})
test('checks all alternatives, including a fitting layout after an overflowing one',async()=>{
 let calls=0
 const result=await reflowScorebookLayout(original,{measure:async ratio=>{calls++;return {...original,rows:11,wrapWidthRatio:ratio,systemDensities:[ratio]};},fits:l=>l.wrapWidthRatio<0.9})
 assert.equal(calls,reflowRatios.length);assert.equal(result.wrapWidthRatio,0.76)
})

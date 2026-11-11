import assert from 'node:assert/strict'
import { test } from 'node:test'
import { paginateScorebookLayout, packScorebookGroup, scorebookPageStyle, validateScorebookStyles } from './scorebook-pagination.mjs'

const page = { bodyHeight: 200, scale: 1, minimumFillPercent: 90 }
const layout = cuts => ({ rows: cuts.length - 1, cuts })

test('the height floor is strict, including for a one-page score', () => {
  assert.equal(paginateScorebookLayout(layout([0, 180]), {}, page), null)
  assert.deepEqual(paginateScorebookLayout(layout([0, 181]), {}, page), [[0, 1]])
})

test('pagination balances complete systems and includes the continuation title', () => {
  const score = layout([0, 40, 80, 120, 185, 225, 265, 305, 335])
  assert.deepEqual(paginateScorebookLayout(score, { pageCount: 2 }, page), [[0, 4], [4, 8]])
  assert.equal(paginateScorebookLayout(score, { pageCount: 3 }, page), null)
})

test('a short complete score can wait for packing, but a short continuation cannot', () => {
  assert.deepEqual(paginateScorebookLayout(layout([0, 80]), { sharePage: true }, page), [[0, 1]])
  assert.equal(paginateScorebookLayout(layout([0, 185, 190, 195, 200, 205]), { sharePage: true }, page), null)
})

test('manual breaks must satisfy the same page floor, capacity and page count', () => {
  const score = layout([0, 185, 335])
  assert.deepEqual(paginateScorebookLayout(score, { pageBreaks: [1], pageCount: 2 }, page), [[0, 1], [1, 2]])
  assert.equal(paginateScorebookLayout(layout([0, 180, 330]), { pageBreaks: [1] }, page), null)
  assert.equal(paginateScorebookLayout(layout([0, 201, 351]), { pageBreaks: [1] }, page), null)
  assert.equal(paginateScorebookLayout(score, { pageBreaks: [1], pageCount: 3 }, page), null)
})

const entry = candidates => ({ sharedLayouts: new Map(candidates.map(([width, height]) => [width, { width, height }])) })
const packing = { bodyHeight: 200, shortGap: 22, minimumFillPercent: 90, renderScale: () => 1, maximumSharedWidth: 780 }

test('packing chooses the grouping and one common note size together', () => {
  const group = [entry([[520, 80], [640, 60]]), entry([[520, 80], [640, 60]])]
  const pages = packScorebookGroup(group, packing)
  assert.equal(pages.length, 1)
  assert.equal(pages[0].used, 182)
  assert.deepEqual(pages[0].layouts.map(item => item.width), [520, 520])
})

test('packing rejects exactly 90 percent and incompatible note sizes', () => {
  assert.equal(packScorebookGroup([entry([[520, 79]]), entry([[520, 79]])], packing), null)
  assert.equal(packScorebookGroup([entry([[520, 80]]), entry([[640, 80]])], packing), null)
})

test('already full scores stay on separate pages when sharing requires excessive reduction', () => {
  const group = [entry([[520, 185], [900, 80]]), entry([[520, 185], [900, 80]])]
  const pages = packScorebookGroup(group, packing)
  assert.equal(pages.length, 2)
  assert(pages.every(item => item.end - item.start === 1 && item.layouts[0].width === 520))
})

test('packing selects compatible spacing variants at a common music size', () => {
  const layout=(height,systemGap)=>({height,systemGap,width:700,rows:3})
  const group=[0,1].map(()=>({sharedLayouts:new Map([[700,layout(35,18)]]),sharedLayoutVariants:new Map([[700,[layout(35,18),layout(45,28)]]])}))
  const pages=packScorebookGroup(group,{bodyHeight:100,shortGap:5,renderScale:()=>1,minimumFillPercent:90})
  assert.equal(pages.length,1)
  assert.equal(pages[0].used,95)
  assert.deepEqual(pages[0].layouts.map(l=>l.systemGap),[28,28])
})

test('font priority keeps larger music even when short works require another page', () => {
  const group=[0,1].map(()=>({sharedLayouts:new Map([[600,{width:600,height:60,rows:4,systemGap:18}],[700,{width:700,height:45,rows:4,systemGap:18}]])}))
  const settings={bodyHeight:100,shortGap:5,renderScale:()=>1,minimumFillPercent:0}
  const compact=packScorebookGroup(group,settings)
  assert.equal(compact.length,1)
  assert.equal(compact[0].layouts[0].width,700)
  const readable=packScorebookGroup(group,{...settings,priority:'font'})
  assert.equal(readable.length,2)
  assert(readable.every(p=>p.layouts.every(l=>l.width===600)))
})


test('fixed shared page keeps all works together while maximizing music size', () => {
 const group=[0,1].map(()=>({sharedLayouts:new Map([[600,{width:600,height:60,rows:4}],[700,{width:700,height:45,rows:4}]])}))
 const settings={bodyHeight:100,shortGap:5,renderScale:()=>1,priority:'font',keepTogether:true}
 const pages=packScorebookGroup(group,settings)
 assert.equal(pages.length,1)
 assert(pages[0].layouts.every(l=>l.width===700))
 assert.equal(packScorebookGroup(group,{...settings,bodyHeight:90}),null)
})

test('shared works require one common system gap as well as one common music size',()=>{
 const layout=systemGap=>({width:640,height:40,rows:3,systemGap})
 const group=[18,11].map(gap=>({sharedLayouts:new Map([[640,layout(gap)]]),sharedLayoutVariants:new Map([[640,[layout(gap)]]])}))
 assert.equal(packScorebookGroup(group,{bodyHeight:100,shortGap:5,renderScale:()=>1,keepTogether:true}),null)
 group[1].sharedLayoutVariants.get(640).push(layout(18))
 const packed=packScorebookGroup(group,{bodyHeight:100,shortGap:5,renderScale:()=>1,keepTogether:true})
 assert.deepEqual(packed[0].layouts.map(l=>l.systemGap),[18,18])
})


test('shared pages use one spacing and row-height policy while standalone overrides remain available',()=>{
 const defaults={noteGapEm:0.6,minimumNoteGapEm:0.4,uniformSystemHeight:true}
 const overrides={noteGapEm:0.8,minimumNoteGapEm:0.5,uniformSystemHeight:false}
 assert.deepEqual(scorebookPageStyle({...overrides,sharePage:true},defaults),defaults)
 assert.deepEqual(scorebookPageStyle({...overrides,sharePage:false},defaults),overrides)
})


test('style validation covers both neighbours on one page and the same work across pages',()=>{
 const style={width:640,systemGap:14,noteGapEm:0.6,minimumNoteGapEm:0.4,uniformSystemHeight:true}
 const item=(id,overrides={})=>({id,style:{...style,...overrides}})
 assert.doesNotThrow(()=>validateScorebookStyles([[item('a'),item('b')],[item('a')]]))
 assert.throws(()=>validateScorebookStyles([[item('a'),item('b',{systemGap:18})]]),/one page/)
 assert.throws(()=>validateScorebookStyles([[item('a')],[item('a',{width:646})]]),/pages of one score/)
 assert.throws(()=>validateScorebookStyles([[item('a')],[item('a',{noteGapEm:0.8})]]),/pages of one score/)
 assert.throws(()=>validateScorebookStyles([[item('a')],[item('a',{systemGap:18})]]),/pages of one score/)
})

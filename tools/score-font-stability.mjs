import { CanvasTextMeasurer, compileScore } from '@m3n/jpfun'
import { parseM3NDocument } from '@m3n/notation'
import { NumberedNotationScore, prepareNumberedNotationFonts } from '@m3n/numbered-notation'
import { projectNumberedScore } from '../packages/numbered-notation/src/projection.ts'
import { renderInteractivePages } from '../packages/numbered-notation/src/svg.ts'
import { createSvgInkMeasurer } from './lib/svg-ink-bounds.mjs'
export { prepareNumberedNotationFonts }
/** Trial only: change engraving font sizes before layout; keep page dimensions,
 *  11px internal margins, 24px system gaps and note-clearance policy fixed.
 *  Never scale a completed SVG to simulate a font-size change. */
export function probe(source, width, size) {
 const textMeasurer = new CanvasTextMeasurer(document.createElement('canvas').getContext('2d'))
 const doc = parseM3NDocument(source)
 const projection=projectNumberedScore(doc,{textMeasurer,width,paged:true,pageMargin:11})
 const ratio=size/22
 const modified=projection.source.replace(/("(?:\\.|[^"\\])*")|\b(fontsize|size)=(\d+(?:\.\d+)?)(px)?/g,(all,quoted,key,value,unit)=>quoted??`${key}=${Number(value)*ratio}${unit??''}`)
 const result=compileScore(modified,{autoWrap:true,minimumNoteGap:22*.4,noteGap:22*.6,alignRelations:true,textMeasurer})
 const markup=renderInteractivePages(result,{...projection,source:modified})
 const host=document.querySelector('#scratch');host.innerHTML=markup.join('')
 const svgs=[...host.querySelectorAll(':scope > svg')]
 const signature=svgs.map(svg=>[...svg.querySelectorAll('g.system')].map(system=>[...system.querySelectorAll('g.measure')].map(m=>({measure:m.getAttribute('data-m3n-measure-id'),events:[...m.querySelectorAll('g.note')].map(n=>n.id)}))))
 const ink=createSvgInkMeasurer(),outside=[],overlaps=[]
 for(const [page,svg] of svgs.entries()){
 const v=svg.viewBox.baseVal
 for(const node of svg.querySelectorAll('text,path,line,circle,rect,polygon,ellipse')){
 if(node.closest('defs'))continue;const b=ink(node)
 if(b.y>=v.y+v.height||b.y+b.height<=v.y)continue
 if(b.width&&b.height&&(b.x<v.x-.75||b.x+b.width>v.x+v.width+.75||b.y<v.y-.75||b.y+b.height>v.y+v.height+.75))outside.push({page:page+1,tag:node.tagName,text:node.textContent})
 }
 for(const selector of ['text[data-m3n-role="lyric"],text[data-m3n-role="lyric-prefix"]','g.note text']){
 const nodes=[...svg.querySelectorAll(selector)].filter(n=>n.textContent.trim()&&(selector[0]!=='g'||/^[0-7]$/.test(n.textContent)))
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
 const a=ink(nodes[i]),b=ink(nodes[j]);if(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>.5&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>.5)overlaps.push({page:page+1,a:nodes[i].textContent,b:nodes[j].textContent})
 }
 }
 }
 const identical=size!==22||JSON.stringify(markup)===JSON.stringify(NumberedNotationScore.create(doc).render({width,paged:true,pageMargin:11}))
 return {width,size,pageCount:svgs.length,systemsPerPage:signature.map(p=>p.length),signature,outside,overlaps,identical,markup}
}

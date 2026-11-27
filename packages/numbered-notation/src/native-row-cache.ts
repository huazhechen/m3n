import { copyNativeDecoration } from './native-system-labels.js'
import type { NativeGlyph } from './native-model.js'
import type { NativeSystem, NativeRelation } from './native-layout.js'
import type { NativeRelationLayout } from './native-relations.js'

const relationKey = (relation: NativeRelation) => `${relation.kind}:${relation.first.id}:${relation.last.id}:${relation.label ?? ''}`
const glyphs = (system: NativeSystem) => system.measures.flatMap(measure => measure.columns.flatMap(column => column.glyphs))
export type NativeRowHorizontal={lanes:NativeSystem['lanes'];measures:{start:number;end:number;barX?:number;openingBarX?:number;
  navigation:(number|undefined)[];columns:{x:number;controls:(number|undefined)[][]}[]}[]}
export function captureNativeRowHorizontal(system:NativeSystem):NativeRowHorizontal {
  return {lanes:system.lanes.map(lane=>({...lane,rows:[...lane.rows]})),measures:system.measures.map(measure=>({
    start:measure.start,end:measure.end,barX:measure.barX,openingBarX:measure.openingBarX,
    navigation:measure.navigation?.map(mark=>mark.x) ?? [],
    columns:measure.columns.map(column=>({x:column.x,controls:column.glyphs.map(glyph=>glyph.controls.map(control=>control.x))}))}))}
}
export function restoreNativeRowHorizontal(system:NativeSystem,snapshot:NativeRowHorizontal) {
  system.lanes=snapshot.lanes.map(lane=>({...lane,rows:[...lane.rows]}))
  system.measures.forEach((measure,index)=>{
    const saved=snapshot.measures[index]!
    measure.start=saved.start;measure.end=saved.end;measure.barX=saved.barX;measure.openingBarX=saved.openingBarX
    measure.navigation?.forEach((mark,index)=>{mark.x=saved.navigation[index]})
    measure.columns.forEach((column,index)=>{
      const placed=saved.columns[index]!;column.x=placed.x
      column.glyphs.forEach((glyph,index)=>{glyph.x=placed.x;glyph.controls.forEach((control,at)=>{control.x=placed.controls[index]![at]})})
    })
  })
}
type PlacedGlyph = Pick<NativeGlyph, 'top' | 'bottom' | 'markLayout' | 'annotationLayout' | 'lyricBaselines' | 'lyricHyphenEnds'>
export type NativeRowSnapshot = {
  lanes: NativeSystem['lanes']; decorations: NativeSystem['decorationLayout']; voltas: NativeSystem['voltas']
  glyphs: Map<string, PlacedGlyph>; relations: Map<string, NativeRelationLayout>
}
/** Snapshots stay in local coordinates. Pagination mutates fresh row/glyph
 * objects only; neither cache hits nor losing plans can move the winner. */
export function captureNativeRow(system: NativeSystem): NativeRowSnapshot {
  return { lanes: system.lanes.map(lane=>({...lane,rows:[...lane.rows]})),
    decorations: system.decorationLayout?.map(copyNativeDecoration), voltas: system.voltas?.map(item=>({...item})),
    glyphs: new Map(glyphs(system).map(glyph=>[glyph.id,{top:glyph.top,bottom:glyph.bottom,
      markLayout:glyph.markLayout?.map(item=>({...item})), annotationLayout:glyph.annotationLayout?.map(item=>({...item})),
      lyricBaselines:glyph.lyricBaselines && new Map(glyph.lyricBaselines), lyricHyphenEnds:glyph.lyricHyphenEnds && new Map(glyph.lyricHyphenEnds)}])),
    relations: new Map([...(system.relationLayout ?? [])].map(([relation,layout])=>[relationKey(relation),layout])) }
}
export function restoreNativeRow(system: NativeSystem, snapshot: NativeRowSnapshot) {
  system.lanes = snapshot.lanes.map(lane=>({...lane,rows:[...lane.rows]}))
  system.decorationLayout = snapshot.decorations?.map(copyNativeDecoration)
  system.voltas = snapshot.voltas?.map(item=>({...item}))
  for(const glyph of glyphs(system)) {
    const state=snapshot.glyphs.get(glyph.id)!
    Object.assign(glyph,state,{markLayout:state.markLayout?.map(item=>({...item})),annotationLayout:state.annotationLayout?.map(item=>({...item})),
      lyricBaselines:state.lyricBaselines && new Map(state.lyricBaselines),lyricHyphenEnds:state.lyricHyphenEnds && new Map(state.lyricHyphenEnds)})
  }
}
export function restoreNativeRowRelations(system: NativeSystem, snapshot: NativeRowSnapshot) {
  system.relationLayout = new Map(system.relations.map(relation=>[relation,snapshot.relations.get(relationKey(relation))!]))
}

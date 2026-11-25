import ts from 'typescript'

// Diagnostic bundle only: production engraving sources and exports stay unchanged.
const stages = {
  'staff-measurement-task.js': { prepareNumberedNotationFonts: ['fontPreparation', true], projectStaffDocument: ['projection'], textMeasurer: ['textMeasurerFactory', false, true] },
  'staff-score.js': { staffHeader: ['header'],
    planStaffLines: ['linePlanning'], engraveStaffSystems: ['engraving'], paginateStaff: ['pagination'] },
  'staff-system.js': { createStaffMeasure: ['nativeMeasureForDrawing'], drawStaffMeasure: ['nativeDrawing'],
    arrangeStaffSystem: ['systemArrangement'], staffLyricDrawing: ['lyricDrawing'] },
  'staff-engine.js': { staffCommandPath: ['numericPathPreparation'], staffGlyph: ['glyphPlacement'] },
}

export function staffBenchmarkInstrumentation() {
  return { name: 'staff-benchmark-instrumentation', transform(code, id) {
    const file = id.split('/').at(-1), selected = stages[file]
    if (!selected || !id.includes('/score-renderer/dist/staff/')) return
    const source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const edits = [], wrappers = []
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) continue
      const bindings = statement.importClause?.namedBindings
      if (!bindings || !ts.isNamedImports(bindings)) continue
      for (const specifier of bindings.elements) {
        const name = specifier.name.text, stage = selected[name]
        if (!stage) continue
        edits.push({start:specifier.getStart(source),end:specifier.end,text:`${specifier.propertyName?.text ?? name} as __staffOriginal_${name}`})
        const [key, asynchronous, factory] = stage
        wrappers.push(`const ${name} = ${asynchronous?'async ':''}(...args) => {
          const record = globalThis.__staffBenchmark;
          if (!record) return __staffOriginal_${name}(...args);
          record.${key}Calls = (record.${key}Calls ?? 0) + 1;
          const started = performance.now();
          try {
            const result = ${asynchronous?'await ':''}__staffOriginal_${name}(...args);
            ${factory?`return (...values) => {
              const active = globalThis.__staffBenchmark;
              if (active) active.textMeasureRequests = (active.textMeasureRequests ?? 0) + 1;
              return result(...values);
            };`:'return result;'}
          } finally { record.${key}Ms = (record.${key}Ms ?? 0) + performance.now() - started; }
        };`)
      }
    }
    for (const edit of edits.sort((a,b)=>b.start-a.start)) code = code.slice(0,edit.start)+edit.text+code.slice(edit.end)
    if (wrappers.length !== Object.keys(selected).length) throw new Error(`Missing staff instrumentation target in ${file}`)
    return {code:code+'\n'+wrappers.join('\n'),map:null}
  } }
}

import { parseM3NDocument } from '../m3n-direct.js' 
import { m3nToMei } from '../m3n-mei.js'
import { projectM3NDocument } from './m3n-document.js'
import { invalidMeasureIds } from './measure-diagnostics.js'
import { parseM3NSyntaxTree } from './syntax-tree.js'
import type { MeiConversionResult } from '../m3n-mei.js'
import type { M3NDocumentProjection } from './m3n-document.js'
import type { ScoreDocument } from './score-document.js'
import type { M3NSyntaxTree } from './syntax-tree.js'
import { validateM3NDiagnostics } from '../m3n-validate.js'
import type { ScoreDiagnostic } from './diagnostics.js'

export type M3NAnalysisSnapshot = {
  source: string
  syntaxTree: M3NSyntaxTree
  projection: M3NDocumentProjection
  score: ScoreDocument
  diagnostics: ScoreDiagnostic[]
  invalidMeasureIds: string[]
}
export type M3NAnalysis = M3NAnalysisSnapshot & { conversion: MeiConversionResult }

/** Single parse boundary used by interactive consumers and future incremental analysis. */
export function analyzeM3NSnapshot(source: string): M3NAnalysisSnapshot {
  const syntaxTree = parseM3NSyntaxTree(source)
  const projection = projectM3NDocument(source, syntaxTree)
  const score = parseM3NDocument(source, projection)
  const diagnostics = validateM3NDiagnostics(source, {}, score, { syntaxTree, projection })
  return {
    source,
    syntaxTree,
    projection,
    score,
    diagnostics,
    invalidMeasureIds: invalidMeasureIds(source, score, diagnostics),
  }
}

/** Restores lazy derived data after a structured-clone/Worker boundary. */
export function restoreM3NAnalysis(snapshot: M3NAnalysisSnapshot): M3NAnalysis {
  let conversion: MeiConversionResult | undefined
  return {
    ...snapshot,
    get conversion() {
      const { source, score, syntaxTree, projection, diagnostics } = snapshot
      return conversion ??= m3nToMei(source, score, { syntaxTree, projection, diagnostics })
    },
  }
}

export function analyzeM3N(source: string): M3NAnalysis {
  return restoreM3NAnalysis(analyzeM3NSnapshot(source))
}

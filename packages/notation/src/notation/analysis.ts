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

export type M3NAnalysis = {
  source: string
  syntaxTree: M3NSyntaxTree
  projection: M3NDocumentProjection
  score: ScoreDocument
  diagnostics: ScoreDiagnostic[]
  conversion: MeiConversionResult
  invalidMeasureIds: string[]
}

/** Single parse boundary used by interactive consumers and future incremental analysis. */
export function analyzeM3N(source: string): M3NAnalysis {
  const syntaxTree = parseM3NSyntaxTree(source)
  const projection = projectM3NDocument(source, syntaxTree)
  const score = parseM3NDocument(source, projection)
  const diagnostics = validateM3NDiagnostics(source, {}, score, { syntaxTree, projection })
  let conversion: MeiConversionResult | undefined
  return {
    source,
    syntaxTree,
    projection,
    score,
    diagnostics,
    get conversion() {
      return conversion ??= m3nToMei(source, score, { syntaxTree, projection, diagnostics })
    },
    invalidMeasureIds: invalidMeasureIds(source, score, diagnostics),
  }
}

import { parseM3NDocument } from '../m3n-direct.js' 
import { m3nToMei } from '../m3n-mei.js'
import { assessM3NDocumentMelodyComplexity } from '../m3n-melody-complexity.js'
import { projectM3NDocument } from './m3n-document.js'
import { invalidMeasureIds } from './measure-diagnostics.js'
import { parseM3NSyntaxTree } from './syntax-tree.js'
import type { MeiConversionResult } from '../m3n-mei.js'
import type { M3NDocumentProjection } from './m3n-document.js'
import type { ScoreDocument } from './score-document.js'
import type { M3NSyntaxTree } from './syntax-tree.js'

export type M3NAnalysis = {
  source: string
  syntaxTree: M3NSyntaxTree
  projection: M3NDocumentProjection
  score: ScoreDocument
  conversion: MeiConversionResult
  complexity: ReturnType<typeof assessM3NDocumentMelodyComplexity>
  invalidMeasureIds: string[]
}

/** Single parse boundary used by interactive consumers and future incremental analysis. */
export function analyzeM3N(source: string): M3NAnalysis {
  const syntaxTree = parseM3NSyntaxTree(source)
  const projection = projectM3NDocument(source, syntaxTree)
  const score = parseM3NDocument(source, projection)
  const conversion = m3nToMei(source, score, { syntaxTree, projection })
  return {
    source,
    syntaxTree,
    projection,
    score,
    conversion,
    complexity: assessM3NDocumentMelodyComplexity(score),
    invalidMeasureIds: invalidMeasureIds(source, score),
  }
}

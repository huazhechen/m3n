import { parseM3NDocument } from '../m3n-direct'
import { m3nToMei } from '../m3n-mei'
import { assessM3NDocumentMelodyComplexity } from '../m3n-melody-complexity'
import { projectM3NDocument } from './m3n-document'
import { invalidMeasureIds } from './measure-diagnostics'
import { parseM3NSyntaxTree } from './syntax-tree'
import type { MeiConversionResult } from '../m3n-mei'
import type { M3NDocumentProjection } from './m3n-document'
import type { ScoreDocument } from './score-document'
import type { M3NSyntaxTree } from './syntax-tree'

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

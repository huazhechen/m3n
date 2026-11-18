import { deriveScoreInteraction, type ScoreInteraction } from './score-interaction.js'
import { parseM3NDocument } from '../m3n-direct.js' 
import { projectM3NDocument } from './m3n-document.js'
import { invalidMeasureIds } from './measure-diagnostics.js'
import { parseM3NSyntaxTree } from './syntax-tree.js'
import type { M3NDocumentProjection } from './m3n-document.js'
import type { ScoreDocument } from './score-document.js'
import type { M3NSyntaxTree } from './syntax-tree.js'
import { validateM3NDiagnostics } from '../m3n-validate.js'
import type { ScoreDiagnostic } from './diagnostics.js'

export type M3NAnalysis = {
  source: string
  syntaxTree: M3NSyntaxTree
  projection: M3NDocumentProjection
  interaction: ScoreInteraction
  score: ScoreDocument
  diagnostics: ScoreDiagnostic[]
  invalidMeasureIds: string[]
}

/** Single parse boundary used by interactive consumers and future incremental analysis. */
export function analyzeM3N(source: string): M3NAnalysis {
  const syntaxTree = parseM3NSyntaxTree(source)
  const projection = projectM3NDocument(source, syntaxTree)
  const score = parseM3NDocument(source, projection)
  const diagnostics = validateM3NDiagnostics(source, {}, score, { syntaxTree, projection })
  return {
    source,
    syntaxTree,
    projection,
    score,
    interaction: deriveScoreInteraction(score),
    diagnostics,
    invalidMeasureIds: invalidMeasureIds(source, score, diagnostics),
  }
}

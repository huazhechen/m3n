import { parseM3NDocument } from '../m3n-direct'
import { m3nToMei } from '../m3n-mei'
import { assessM3NDocumentMelodyComplexity } from '../m3n-melody-complexity'
import { invalidMeasureIds } from '../m3n-validate'
import { parseM3NSyntaxTree } from './syntax-tree'

/** Single parse boundary used by interactive consumers and future incremental analysis. */
export function analyzeM3N(source: string) {
  const syntaxTree = parseM3NSyntaxTree(source)
  const score = parseM3NDocument(source)
  const conversion = m3nToMei(source, score)
  return {
    syntaxTree,
    score,
    conversion,
    complexity: assessM3NDocumentMelodyComplexity(score),
    invalidMeasureIds: invalidMeasureIds(source, score),
  }
}

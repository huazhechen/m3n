import { parseM3NDocument } from '../m3n-direct'
import { m3nToMei } from '../m3n-mei'
import { assessM3NDocumentMelodyComplexity } from '../m3n-melody-complexity'
import { invalidMeasureIds } from '../m3n-validate'
import { projectM3NDocument } from './m3n-document'
import { parseM3NSyntaxTree } from './syntax-tree'

/** Single parse boundary used by interactive consumers and future incremental analysis. */
export function analyzeM3N(source: string) {
  const syntaxTree = parseM3NSyntaxTree(source)
  const projection = projectM3NDocument(source, syntaxTree)
  const score = parseM3NDocument(source, projection)
  const conversion = m3nToMei(source, score, { syntaxTree, projection })
  return {
    syntaxTree,
    projection,
    score,
    conversion,
    complexity: assessM3NDocumentMelodyComplexity(score),
    invalidMeasureIds: invalidMeasureIds(source, score),
  }
}

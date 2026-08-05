import { createScoreDiagnostic, type ScoreDiagnostic } from './diagnostics'
import type { M3NSyntaxTree } from './syntax-tree'

const INTERVALS = new Set(['cresc', 'decres', 'dim', 'lg', '8va', '8vb', 'inst', 'accel', 'rit'])

export function validateM3NSyntaxTree(tree: M3NSyntaxTree): ScoreDiagnostic[] {
  const diagnostics: ScoreDiagnostic[] = []
  const stack: Array<{ name: string; node: M3NSyntaxTree['directives'][number] }> = []
  const report = (code: string, message: string, node: M3NSyntaxTree['directives'][number]) => {
    diagnostics.push(createScoreDiagnostic({
      code,
      range: { start: node.start, end: node.end },
      message: `第 ${node.line} 行：${message}`,
      messageArgs: { directive: node.name },
    }))
  }
  for (const directive of tree.directives) {
    if ((directive.name === 'cresc' || directive.name === 'decres' || directive.name === 'dim')
      && directive.value !== undefined && directive.value !== 'text') {
      report('M3N_DIRECTIVE_INVALID_DISPLAY', '渐强渐弱只支持 text 显示参数', directive)
    }
    if ((directive.name === 'accel' || directive.name === 'rit') && !directive.closing) {
      const target = Number(directive.value)
      if (!Number.isSafeInteger(target) || target <= 0) {
        report('M3N_DIRECTIVE_INVALID_TEMPO_TARGET', '渐快或渐慢的目标速度必须是正整数', directive)
      }
    }
    if (directive.closing && directive.name === '') {
      if (stack.length === 0) report('M3N_DIRECTIVE_UNMATCHED_CLOSE', `多余的区间结束指令：${directive.raw}`, directive)
      else stack.pop()
      continue
    }
    if (!INTERVALS.has(directive.name)) continue
    if (!directive.closing) {
      stack.push({ name: directive.name, node: directive })
      continue
    }
    const active = stack.at(-1)
    if (!active) report('M3N_DIRECTIVE_UNMATCHED_CLOSE', `多余的区间结束指令：${directive.raw}`, directive)
    else if (active.name !== directive.name) report('M3N_DIRECTIVE_MISMATCHED_CLOSE', `区间结束指令 ${directive.raw} 与当前 ${active.name} 不匹配`, directive)
    else stack.pop()
  }
  for (const active of stack) report('M3N_DIRECTIVE_UNCLOSED', `区间指令未闭合：${active.name}`, active.node)
  return diagnostics
}

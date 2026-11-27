import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'

const input = resolve(process.argv[2] ?? '.tmp/numbered-width-review/report.json')
const report = JSON.parse(readFileSync(input, 'utf8'))
assert(report.complete, 'Only publish a complete corpus review')
const output = resolve(process.argv[3] ?? dirname(input))
const number = value => Number(value ?? 0).toFixed(4)
const gain = (selected, alternative) => 100 * (selected.width / alternative.width - 1)
const csv = values => values.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')
const candidateRows = [['file', 'title', 'width', 'pages', 'rows', 'selected', 'uniformity', 'crowded', 'expanded', 'font', 'total', 'gap_p10', 'gap_median', 'gap_p90', 'crowded_intervals', 'expanded_intervals', 'intervals', 'measure_rows']]
const summaryRows = [['file', 'title', 'selected', 'pages', 'minimum_same_page', 'font_gain_percent', 'minimum_rows', 'selected_rows', 'best_larger', 'global_best', 'same_break_minimum', 'comfortable_minimum', 'total_gain_over_minimum', 'uniformity_gain', 'crowding_gain', 'expansion_gain', 'font_cost_increase', 'ink_issues']]
const lines = ['# 简谱同页更大字体全量复查', '',
  `输入版本：\`${report.revision}\`。共${report.entries.length}首，字体SHA-256与共享TTF归档逐项核对；每首先读取真实阅读器，再独立完整枚举528～768px、6px步长的41档。`, '',
  '字号收益按固定纸面宽度下的比例计算：当前选宽／替代选宽－1。最小宽度候选的页数不多于当前方案；断行、拥挤、均匀度和过疏可能不同。字号收益不代表替代方案一定更易读。', '',
  '均／拥／疏为当前方案相对最小宽度方案减少的三项代价；负数表示变差。字体项为当前方案增加的字号缩小代价。总收益＝均＋拥＋疏－字体项（另有溢出项时以总代价为准）。完整候选与断行见同目录CSV。', '',
  '| 曲目 | 当前／最小宽度 | 页数 | 最小宽度字号收益 | 行数 当前／最小 | 更大字体中最佳 | 完整网格最佳 | 均／拥／疏收益；字体代价增加 | 总收益 |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
for (const entry of report.entries) {
  const s = entry.selected, m = entry.minimum
  const benefits = [m.spacingUnevenCost - s.spacingUnevenCost, m.spacingCrampedCost - s.spacingCrampedCost,
    m.spacingExpandedCost - s.spacingExpandedCost, s.fontSizeCost - m.fontSizeCost]
  const total = m.totalCost - s.totalCost
  lines.push(`| ${entry.title} | ${s.width}／${m.width} | ${s.pageCount} | ${gain(s, m).toFixed(2)}% | ${s.rows}／${m.rows} | ${entry.bestLarger?.width ?? '—'} | ${entry.globalBest.width} | ${benefits.slice(0, 3).map(number).join('／')}；${number(benefits[3])} | ${number(total)} |`)
  summaryRows.push([entry.file, entry.title, s.width, s.pageCount, m.width, gain(s, m), m.rows, s.rows, entry.bestLarger?.width,
    entry.globalBest.width, entry.sameBreakMinimum?.width, entry.comfortableMinimum?.width, total, ...benefits, entry.validationIssues.length])
  for (const c of entry.candidates) candidateRows.push([entry.file, entry.title, c.width, c.pageCount, c.rows, c.width === s.width,
    c.spacingUnevenCost, c.spacingCrampedCost, c.spacingExpandedCost, c.fontSizeCost, c.totalCost,
    c.intervals.p10, c.intervals.median, c.intervals.p90, c.intervals.crowded, c.intervals.expanded, c.intervals.count, JSON.stringify(c.measureRows)])
}
writeFileSync(join(output, 'NUMBERED_WIDTH_REVIEW.md'), lines.join('\n') + '\n')
writeFileSync(join(output, 'NUMBERED_WIDTH_REVIEW.csv'), summaryRows.map(csv).join('\n') + '\n')
writeFileSync(join(output, 'NUMBERED_WIDTH_CANDIDATES.csv'), candidateRows.map(csv).join('\n') + '\n')
console.log(`${report.entries.length} scores; ${report.entries.filter(e => e.selected.width > e.minimum.width).length} have larger-font same-page alternatives; ${report.entries.filter(e => e.globalBest.width !== e.selected.width).length} production/global differences`)

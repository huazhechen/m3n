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
const assessment = entry => {
  const s = entry.selected, m = entry.minimum, b = entry.bestLarger
  if (entry.globalBest.width !== s.width) return `搜索遗漏：完整网格应选${entry.globalBest.width}px`
  if (!b) return '已选同页最小宽度'
  const gap = b.totalCost - s.totalCost
  const reasons = [
    ['均匀度', b.spacingUnevenCost - s.spacingUnevenCost],
    ['拥挤', b.spacingCrampedCost - s.spacingCrampedCost],
    ['过疏', b.spacingExpandedCost - s.spacingExpandedCost],
  ].sort((a, b) => b[1] - a[1])
  const largeFontTradeoff = gain(s, b) >= 5 && gap < .05
  const sameBreak = JSON.stringify(s.measureRows) === JSON.stringify(b.measureRows)
  return `${largeFontTradeoff ? `字号取舍大，净评分优势有限；拥挤间隔${b.intervals.crowded}/${b.intervals.count}→${s.intervals.crowded}/${s.intervals.count}，有间距依据` : gap < .01 ? '边际取舍，按规则成立但收益很小' : '间距收益超过字号代价'}：主要减少${reasons[0][0]}代价；比最佳大字体方案改善${number(gap)}${sameBreak ? '，断行相同' : ''}${m.width !== b.width ? `；最小宽度${m.width}px更差` : ''}`
}
const changes = report.entries.filter(entry => entry.baselineWidth !== undefined && entry.baselineWidth !== entry.selected.width)
const candidateRows = [['file', 'title', 'width', 'pages', 'rows', 'selected', 'uniformity', 'crowded', 'expanded', 'font', 'total', 'gap_p10', 'gap_median', 'gap_p90', 'crowded_intervals', 'expanded_intervals', 'intervals', 'measure_rows']]
const summaryRows = [['file', 'title', 'previous_width', 'selected', 'pages', 'minimum_same_page', 'font_gain_percent', 'minimum_rows', 'selected_rows', 'best_larger', 'global_best', 'same_break_minimum', 'comfortable_minimum', 'total_gain_over_minimum', 'uniformity_gain', 'crowding_gain', 'expansion_gain', 'font_cost_increase', 'ink_issues', 'assessment']]
const lines = ['# 简谱同页更大字体全量复查', '',
  `输入版本：\`${report.revision}\`。共${report.entries.length}首，字体SHA-256与共享TTF归档逐项核对；除无独立阅读路由的示例外，先逐曲读取真实阅读器，再独立完整枚举528～768px、6px步长的41档。`, '',
  ...(report.baseline ? [`候选枚举基线：\`${report.baseline.revision}\`；基线报告SHA-256：\`${report.baseline.sha256}\`。本轮保持评分与实际字形几何规则，复用独立41档枚举；对每首重新运行生产搜索、读取隔离构建的真实网页，并重新审计选中及替代候选的页数、断行、间隔和墨迹。复验工具包SHA-256：\`${report.bundleHash}\`。`, '', `搜索修复相对旧局部搜索改变${changes.length}首：${changes.map(entry => `${entry.title} ${entry.baselineWidth}→${entry.selected.width}px`).join('；')}。其余选宽不变。`, ''] : []),
  ...(report.baseline?.enumerationBatches ? [`枚举分${report.baseline.enumerationBatches.length}批完成：${report.baseline.enumerationBatches.map(batch => `${batch.scores.length}首，代码包SHA-256 \`${batch.bundleHash}\``).join('；')}。另一任务更新《暗香》后，已重新枚举该曲，未将旧谱源的696→660px结果计入本表。表中原选宽为现谱源按旧局部模式重放；114首保留曲目的重放结果与基线真实阅读器逐一一致。`, ''] : []),
  '共享TTF摘要：', '', '| 字体 | SHA-256 |', '|---|---|',
  ...report.fontHashes.map(font => `| ${font.file} | \`${font.sha256}\` |`), '',
  '字号收益按固定纸面宽度下的比例计算：当前选宽／替代选宽－1。最小宽度候选的页数不多于当前方案；断行、拥挤、均匀度和过疏可能不同。字号收益不代表替代方案一定更易读。', '',
  '下表的判断另外比较“更大字体中最佳”候选，避免只用最小宽度的较差排版来证明当前选择。总代价优势不足0.01的条目标为“边际取舍”，字号收益至少5%而总代价优势不足0.05的条目另列出拥挤间隔数量解释显著字号取舍。这些仅是复查标记，不改变评分和排序；不能把净评分略胜直接当作明显的可读性提升。', '',
  '均／拥／疏为当前方案相对最小宽度方案减少的三项代价；负数表示变差。字体项为当前方案增加的字号缩小代价。总收益＝均＋拥＋疏－字体项（另有溢出项时以总代价为准）。完整候选与断行见同目录CSV。', '',
  '| 曲目 | 原选宽→当前／最小宽度 | 页数 | 最小宽度字号收益 | 行数 当前／最小 | 更大字体中最佳 | 完整网格最佳 | 均／拥／疏收益；字体代价增加 | 总收益 | 判断 |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|']
for (const entry of report.entries) {
  const s = entry.selected, m = entry.minimum
  const displayTitle = entry.title + (entry.file.startsWith('examples/') ? '（示例）' : entry.file.startsWith('works/') ? '（独立作品）' : '')
  const benefits = [m.spacingUnevenCost - s.spacingUnevenCost, m.spacingCrampedCost - s.spacingCrampedCost,
    m.spacingExpandedCost - s.spacingExpandedCost, s.fontSizeCost - m.fontSizeCost]
  const total = m.totalCost - s.totalCost
  lines.push(`| [${displayTitle}](../src/${entry.file}) | ${entry.baselineWidth ?? s.width}→${s.width}／${m.width} | ${s.pageCount} | ${gain(s, m).toFixed(2)}% | ${s.rows}／${m.rows} | ${entry.bestLarger?.width ?? '—'} | ${entry.globalBest.width} | ${benefits.slice(0, 3).map(number).join('／')}；${number(benefits[3])} | ${number(total)} | ${assessment(entry)} |`)
  summaryRows.push([entry.file, entry.title, entry.baselineWidth ?? s.width, s.width, s.pageCount, m.width, gain(s, m), m.rows, s.rows, entry.bestLarger?.width,
    entry.globalBest.width, entry.sameBreakMinimum?.width, entry.comfortableMinimum?.width, total, ...benefits, entry.validationIssues.length, assessment(entry)])
  for (const c of entry.candidates) candidateRows.push([entry.file, entry.title, c.width, c.pageCount, c.rows, c.width === s.width,
    c.spacingUnevenCost, c.spacingCrampedCost, c.spacingExpandedCost, c.fontSizeCost, c.totalCost,
    c.intervals.p10, c.intervals.median, c.intervals.p90, c.intervals.crowded, c.intervals.expanded, c.intervals.count, JSON.stringify(c.measureRows)])
}
lines.push('', `共有${report.entries.filter(entry => entry.selected.width > entry.minimum.width).length}首存在同页更大字体方案。这里的页数约束也容许替代方案省页；完整网格选出的赢家已优先最小化页数。`, '')
writeFileSync(join(output, 'NUMBERED_WIDTH_REVIEW.md'), lines.join('\n') + '\n')
writeFileSync(join(output, 'NUMBERED_WIDTH_REVIEW.csv'), summaryRows.map(csv).join('\n') + '\n')
writeFileSync(join(output, 'NUMBERED_WIDTH_CANDIDATES.csv'), candidateRows.map(csv).join('\n') + '\n')
console.log(`${report.entries.length} scores; ${report.entries.filter(e => e.selected.width > e.minimum.width).length} have larger-font same-page alternatives; ${report.entries.filter(e => e.globalBest.width !== e.selected.width).length} production/global differences`)

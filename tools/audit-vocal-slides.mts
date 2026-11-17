/** Read-only structural audit; a match does not prove that a melodic note is dispensable. */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseM3NDocument, deriveScoreInteraction, resolveScorePitches } from '../packages/notation/src/index.js'

export function auditVocalSlides(source: string) {
  const document = parseM3NDocument(source)
  const lyrics = deriveScoreInteraction(document).lyricsByEvent
  const candidates = []
  for (const part of document.parts.values()) {
    const pitches = resolveScorePitches(part.melody)
    const records = part.melody.flatMap((measure, measureIndex) => measure.events.map(event => ({ event, measure, measureIndex })))
    const visible = (event: typeof records[number]['event']) => (lyrics.get(event) ?? []).filter(lyric => lyric.kind === 'text' && lyric.text.trim())
    for (let index = 0; index < records.length - 2; index++) {
      const first = records[index]!.event
      if (first.kind !== 'note' || !visible(first).length || records[index - 1]?.event.tie) continue
      for (const count of [2, 3]) {
        const selected = records.slice(index, index + count + 1)
        if (selected.length !== count + 1) continue
        const group = selected.slice(0, -1).map(record => record.event)
        const next = selected.at(-1)!.event
        if (selected.some(record => record.event.kind !== 'note')) continue
        if (group.some(event => event.tie) || group.slice(1).some(event => visible(event).length)) continue
        // Do not bridge written section/house/repeat boundaries: they may not be adjacent in playback.
        if (selected.slice(1).some((record, offset) => record.measureIndex !== selected[offset]!.measureIndex && (
          record.measure.sectionName !== selected[offset]!.measure.sectionName ||
          record.measure.ending !== selected[offset]!.measure.ending || record.measure.left === 'rptstart' ||
          selected[offset]!.measure.right === 'rptend' || selected[offset]!.measure.navigation?.length ||
          selected[offset]!.event.navigation.length
        ))) continue
        const firstLyrics = visible(first)
        const nextLyrics = visible(next)
        const sharedRows = firstLyrics.filter(a => nextLyrics.some(b => a.verseIndex === b.verseIndex && (
          !a.passes || !b.passes || [...a.passes].some(pass => b.passes!.has(pass))
        )))
        if (!sharedRows.length) continue
        if (pitches.get(group.at(-1)!)?.[0] !== pitches.get(next)?.[0] || pitches.get(first)?.[0] === pitches.get(next)?.[0]) continue
        const slur = document.intervals.some(interval => interval.kind === 'lg' && interval.staff === 'melody' &&
          interval.start !== undefined && interval.end !== undefined && interval.start <= first.sourceStart && interval.end >= group.at(-1)!.sourceEnd)
        const beats = [...group, next].map(event => event.beats)
        candidates.push({
          line: source.slice(0, first.sourceStart).split('\n').length,
          offset: first.sourceStart,
          lyrics: [...new Set(sharedRows.map(a => `${a.text}→${nextLyrics.filter(b => b.verseIndex === a.verseIndex).map(b => b.text).join('/')}`))].join('；'),
          notes: [...group, next].map(event => source.slice(event.sourceStart, event.sourceEnd)),
          beats,
          mergedBeats: group.reduce((total, event) => total + event.beats, 0),
          slur,
          category: count === 3 ? '三音走句，需复核旋律' : !slur ? '无连奏标记，需复核意图' : beats[1]! > 0.5 ? '过渡音较长，需复核旋律' : '二音连奏，优先复核',
        })
      }
    }
  }
  return { title: document.title, hasLyrics: document.lyrics.length > 0, candidates }
}

export function auditLibrary(directory: string) {
  return readdirSync(directory).filter(file => file.endsWith('.m3n')).sort().map(file => {
    const source = readFileSync(resolve(directory, file), 'utf8')
    return { file, sha256: createHash('sha256').update(source).digest('hex'), ...auditVocalSlides(source) }
  })
}

function renderReport(scores: ReturnType<typeof auditLibrary>) {
  const vocal = scores.filter(score => score.hasLyrics)
  const matched = vocal.filter(score => score.candidates.length)
  const all = matched.flatMap(score => score.candidates)
  const categories = [...new Set(all.map(candidate => candidate.category))]
  const lines = [
    '# 人声滑音器乐化排查', '',
    '本报告只读排查当前谱库的歌词与音符对应关系，未修改乐谱、最佳宽度或 PDF。命中表示符合结构，不能仅凭结构断定原曲在此使用滑音。', '',
    `扫描 ${scores.length} 个源文件，其中 ${vocal.length} 首含歌词；${matched.length} 首共 ${all.length} 个候选位置。相同旋律的不同书写位置分别计数，反复播放不重复计数。`, '',
    '## 筛选与处理原则', '',
    '- 同一歌词字占 2～3 个连续单音，中间音没有任何歌词行的独立文字；末音与下一字首音的实际音高相同，首音与下一字不同。比较包含调号、临时变音和八度。',
    '- 排除休止、和弦、三连音事件、延音线连接的组内音，以及段落、房子或反复边界的不确定邻接。组内任何一音在另一歌词行上有文字时，也不列入。',
    '- 连奏标记仅作分类依据，不视为一字多音的充分证据。额外扫描用 `%` 留空但没有 `{lg}` 的相同结构。',
    '- 二音组若确定按器乐简化，将过渡音时值并入首音，保留下一个字的起音时刻：`X(a) Y(b) / Y(c)` → `X(a+b) / Y(c)`；删除相应的歌词占位符，清理已经无用的连奏标记。跨小节时以延音线保持小节边界。',
    '- 三音走句及较长过渡音需要听辨旋律；不要因为结尾重复就一律压成首音。尤其《后来》的“后→来”，含中间级进音，不能仅按重复尾音判断。',
    '- 这里是按谱面顺序的保守筛查，不展开反复与段落演奏顺序；未命中不代表已经完成听辨。没有歌词的曲目、三连音内部、超过三音的拖腔不在此轮自动筛选范围内。', '',
    '复跑：`npx tsx tools/audit-vocal-slides.mts --report scorebook/人声滑音器乐化排查.md`；不传 `--report` 时向标准输出打印含源文件 SHA-256 的 JSON。', '',
    '## 分类统计', '', '| 分类 | 位置数 |', '| --- | ---: |',
    ...categories.map(category => `| ${category} | ${all.filter(candidate => candidate.category === category).length} |`), '',
    '## 逐曲候选', '',
    '音符列直接摘录源事件，括号表达的时值以“拍数”列为准；`/` 分隔下一个字。拍数使用解析器的四分音符拍单位。候选均待音乐判断，以下合并时值仅描述保留下一字起音的二音器乐化方案。', '',
  ]
  for (const score of matched) {
    lines.push(`### ${score.title}（${score.candidates.length} 处）`, '',
      `源文件：[${score.file}](../src/scores/${score.file})；SHA-256：\`${score.sha256}\`。`, '',
      '| 行 | 歌词 | 音符（同字 / 下一字） | 拍数（同字 / 下一字） | 首音合并后拍数 | 分类 |', '| ---: | --- | --- | --- | ---: | --- |')
    for (const candidate of score.candidates) {
      const group = candidate.notes.slice(0, -1).join(' ')
      const beats = candidate.beats.slice(0, -1).join('+')
      lines.push(`| ${candidate.line} | ${candidate.lyrics} | \`${group} / ${candidate.notes.at(-1)}\` | ${beats} / ${candidate.beats.at(-1)} | ${candidate.notes.length === 3 ? candidate.mergedBeats : '待听辨'} | ${candidate.category} |`)
    }
    lines.push('')
  }
  lines.push('## 含歌词但未命中的曲目', '', vocal.filter(score => !score.candidates.length).map(score => score.title).join('、') + '。', '')
  return lines.join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scores = auditLibrary(resolve('src/scores'))
  const reportIndex = process.argv.indexOf('--report')
  if (reportIndex >= 0) {
    const output = process.argv[reportIndex + 1]
    if (!output) throw new Error('--report requires an output path')
    writeFileSync(output, renderReport(scores))
    console.log(`Wrote ${output}: ${scores.flatMap(score => score.candidates).length} candidates`)
  } else console.log(JSON.stringify(scores, null, 2))
}

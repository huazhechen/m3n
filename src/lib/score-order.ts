import { pinyin } from 'pinyin-pro'

const titleCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function titleSortKey(title: string) {
  return pinyin(title, { toneType: 'none', separator: '' })
    .normalize('NFKD')
    .replace(/\p{M}|\p{P}|\p{Z}/gu, '')
    .toLowerCase()
}

/** Chinese titles and Latin titles share one A–Z ordering. */
export function sortScoresByTitle<T extends { title: string }>(scores: readonly T[]): T[] {
  return scores.map(score => ({ score, sortKey: titleSortKey(score.title) }))
    .sort((a, b) => titleCollator.compare(a.sortKey, b.sortKey)
      || a.score.title.localeCompare(b.score.title, 'zh-Hans-CN'))
    .map(({ score }) => score)
}

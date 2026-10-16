export type ScoreDraft = { source: string; updatedAt: string }

function draftKey(scoreId?: string) { return `m3n:draft:${scoreId ?? 'new'}` }

export function loadScoreDraft(scoreId?: string): ScoreDraft | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(draftKey(scoreId)) ?? 'null')
    return value && typeof value === 'object' && 'source' in value && typeof value.source === 'string'
      && 'updatedAt' in value && typeof value.updatedAt === 'string'
      ? { source: value.source, updatedAt: value.updatedAt } : null
  } catch { return null }
}

export function saveScoreDraft(source: string, scoreId?: string) {
  try {
    localStorage.setItem(draftKey(scoreId), JSON.stringify({ source, updatedAt: new Date().toISOString() }))
  } catch (cause) {
    throw new Error('草稿未能保存到浏览器，请下载 M3N 文件备份。', { cause })
  }
}

export function clearScoreDraft(scoreId?: string) {
  try { localStorage.removeItem(draftKey(scoreId)) } catch { /* Saving the work already succeeded. */ }
}

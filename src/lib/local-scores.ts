export const LOCAL_SCORES_KEY = 'm3n:local-scores'
export type LocalScore = {
  id: string
  source: string
  createdAt: string
  updatedAt?: string
  expiresAt: number | null
}

const localScoreIdPattern = /^local-[a-z0-9-]+$/

export function isLocalScoreId(value: string | undefined): value is string {
  return value !== undefined && localScoreIdPattern.test(value)
}

export function createLocalScoreId() {
  return `local-${crypto.randomUUID()}`
}

function isLocalScoreRecord(value: unknown): value is LocalScore {
  return typeof value === 'object' && value !== null
    && typeof (value as LocalScore).id === 'string'
    && typeof (value as LocalScore).source === 'string'
    && typeof (value as LocalScore).createdAt === 'string'
    && ((value as LocalScore).expiresAt === null || typeof (value as LocalScore).expiresAt === 'number')
}

export function pruneExpiredLocalScoreEntries(entries: LocalScore[], now: number) {
  return entries.filter((entry) => entry.expiresAt === null || entry.expiresAt > now)
}

function readLocalScores(strict = false): LocalScore[] {
  try {
    const raw = localStorage.getItem(LOCAL_SCORES_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(isLocalScoreRecord)) throw new Error('Invalid local score data')
    return parsed
  } catch (cause) {
    if (strict) throw new Error('本地保存失败：无法读取已有作品，已保留原始浏览器数据。请先下载当前 M3N 文件备份。', { cause })
    return []
  }
}

function writeLocalScores(scores: LocalScore[]) {
  try {
    localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(scores))
  } catch (cause) {
    throw new Error('本地保存失败：浏览器存储不可用或空间已满。请下载 M3N 文件备份后重试。', { cause })
  }
}

export function pruneExpiredLocalScores(now = Date.now()) {
  const scores = readLocalScores()
  const remaining = pruneExpiredLocalScoreEntries(scores, now)
  if (remaining.length !== scores.length) writeLocalScores(remaining)
  return remaining
}

export function saveLocalScore(source: string, now = Date.now(), existingId?: string): LocalScore {
  const scores = pruneExpiredLocalScoreEntries(readLocalScores(true), now)
  const previous = existingId ? scores.find(score => score.id === existingId) : undefined
  if (existingId && !previous) throw new Error('原乐谱已不存在，请另存为新乐谱。')
  const score: LocalScore = {
    id: previous?.id ?? createLocalScoreId(),
    source,
    createdAt: previous?.createdAt ?? new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: null,
  }
  writeLocalScores([score, ...scores.filter(item => item.id !== score.id)])
  return score
}

export function loadLocalScore(id: string): LocalScore | null {
  return pruneExpiredLocalScores().find((score) => score.id === id) ?? null
}

export function listLocalScores(): LocalScore[] {
  return pruneExpiredLocalScores()
}

export function deleteLocalScore(id: string) {
  writeLocalScores(pruneExpiredLocalScores().filter((score) => score.id !== id))
}

export const LOCAL_SCORES_KEY = 'm3n:local-scores'
export const LOCAL_SCORE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type LocalScore = {
  id: string
  source: string
  createdAt: string
  expiresAt: number
}

const localScoreIdPattern = /^local-[a-z0-9-]+$/

export function isLocalScoreId(value: string | undefined): value is string {
  return value !== undefined && localScoreIdPattern.test(value)
}

export function createLocalScoreId() {
  return `local-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
}

function isLocalScoreRecord(value: unknown): value is LocalScore {
  return typeof value === 'object' && value !== null
    && typeof (value as LocalScore).id === 'string'
    && typeof (value as LocalScore).source === 'string'
    && typeof (value as LocalScore).createdAt === 'string'
    && typeof (value as LocalScore).expiresAt === 'number'
}

export function pruneExpiredLocalScoreEntries(entries: LocalScore[], now: number) {
  return entries.filter((entry) => entry.expiresAt > now)
}

function readLocalScores(): LocalScore[] {
  try {
    const raw = localStorage.getItem(LOCAL_SCORES_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isLocalScoreRecord) : []
  } catch {
    return []
  }
}

function writeLocalScores(scores: LocalScore[]) {
  try {
    localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(scores))
  } catch {
    // 本地存储不可用时忽略写入。
  }
}

export function pruneExpiredLocalScores(now = Date.now()) {
  const scores = readLocalScores()
  const remaining = pruneExpiredLocalScoreEntries(scores, now)
  if (remaining.length !== scores.length) writeLocalScores(remaining)
  return remaining
}

export function saveLocalScore(source: string, now = Date.now()): LocalScore {
  const score: LocalScore = {
    id: createLocalScoreId(),
    source,
    createdAt: new Date(now).toISOString(),
    expiresAt: now + LOCAL_SCORE_TTL_MS,
  }
  const scores = pruneExpiredLocalScores(now)
  writeLocalScores([score, ...scores])
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

export const SIMULATED_SUBMISSIONS_KEY = 'm3n:simulated-submissions'
const SIMULATED_SUBMISSION_TTL_MS = 15 * 24 * 60 * 60 * 1000

type SimulatedSubmission = {
  source: string
  createdAt: string
  expiresAt: number
}

function isSimulatedSubmissionRecord(value: unknown): value is SimulatedSubmission {
  return typeof value === 'object' && value !== null
    && typeof (value as SimulatedSubmission).source === 'string'
    && typeof (value as SimulatedSubmission).createdAt === 'string'
    && typeof (value as SimulatedSubmission).expiresAt === 'number'
}

function readSimulatedSubmissions(): Record<string, SimulatedSubmission> {
  try {
    const raw = localStorage.getItem(SIMULATED_SUBMISSIONS_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const records: Record<string, SimulatedSubmission> = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (isSimulatedSubmissionRecord(value)) records[id] = value
    }
    return records
  } catch {
    return {}
  }
}

function writeSimulatedSubmissions(records: Record<string, SimulatedSubmission>) {
  try {
    localStorage.setItem(SIMULATED_SUBMISSIONS_KEY, JSON.stringify(records))
  } catch {
    // 本地存储不可用时忽略写入。
  }
}

export function pruneExpiredSimulatedSubmissions(now = Date.now()) {
  const records = readSimulatedSubmissions()
  const remaining = Object.fromEntries(Object.entries(records).filter(([, record]) => record.expiresAt > now))
  if (Object.keys(remaining).length !== Object.keys(records).length) writeSimulatedSubmissions(remaining)
  return remaining
}

export function saveSimulatedSubmission(id: string, source: string) {
  const records = pruneExpiredSimulatedSubmissions()
  records[id] = {
    source,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + SIMULATED_SUBMISSION_TTL_MS,
  }
  writeSimulatedSubmissions(records)
}

export function loadSimulatedSubmission(id: string) {
  const record = pruneExpiredSimulatedSubmissions()[id]
  return record ? { source: record.source, createdAt: record.createdAt } : null
}

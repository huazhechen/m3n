export const PRACTICE_TIME_KEY = 'm3n:metronome-practice-v1'
export type PracticeDays = Record<string, number>
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function readPracticeDays(): PracticeDays {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PRACTICE_TIME_KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([day, duration]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && typeof duration === 'number' && Number.isFinite(duration) && duration >= 0))
  } catch { return {} }
}
export function addPracticeTime(days: PracticeDays, start: number, end: number): PracticeDays {
  const result = { ...days }
  for (let cursor = start; cursor < end;) {
    const date = new Date(cursor)
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
    const next = Math.min(midnight, end)
    const day = localDay(date)
    result[day] = (result[day] ?? 0) + next - cursor
    cursor = next
  }
  return result
}
export function formatPracticeTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

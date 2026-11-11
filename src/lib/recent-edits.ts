export type RecentEdit = { id: string; title: string; updatedAt: number }
const key = 'm3n:recent-edits'
export function recentEdits(): RecentEdit[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(data) ? data.filter((item): item is RecentEdit => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.updatedAt === 'number').slice(0, 8) : []
  } catch { return [] }
}
export function recordRecentEdit(id: string, title: string) {
  try { localStorage.setItem(key, JSON.stringify([{ id, title, updatedAt: Date.now() }, ...recentEdits().filter(item => item.id !== id)].slice(0, 8))) } catch { /* The actual draft save reports storage errors. */ }
}

export type DocumentHeading = {
  id: string
  title: string
}

export function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  )
}

export function documentHeadings(source: string): DocumentHeading[] {
  const counts = new Map<string, number>()

  return [...source.matchAll(/^##\s+(.+?)\s*#*\s*$/gm)].map((match) => {
    const title = match[1]?.trim() ?? ''
    const baseId = slugify(title)
    const occurrence = (counts.get(baseId) ?? 0) + 1
    counts.set(baseId, occurrence)

    return {
      id: occurrence === 1 ? baseId : `${baseId}-${occurrence}`,
      title,
    }
  })
}

export function searchForDocument(search: string, documentId: string) {
  const params = new URLSearchParams(search)
  params.delete('page')
  params.set('doc', documentId)
  return `?${params.toString()}`
}

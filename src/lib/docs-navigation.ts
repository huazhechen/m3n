export type DocumentHeading = {
  id: string
  title: string
}

export type DocumentSection = DocumentHeading & {
  children: DocumentHeading[]
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

export function documentSections(source: string): DocumentSection[] {
  const counts = new Map<string, number>()
  const sections: DocumentSection[] = []
  let currentSection: DocumentSection | undefined

  for (const match of source.matchAll(/^(#{2,3})\s+(.+?)\s*#*\s*$/gm)) {
    const title = match[2]?.trim() ?? ''
    const baseId = slugify(title)
    const occurrence = (counts.get(baseId) ?? 0) + 1
    counts.set(baseId, occurrence)
    const heading = {
      id: occurrence === 1 ? baseId : `${baseId}-${occurrence}`,
      title,
    }

    if (match[1]?.length === 2) {
      currentSection = { ...heading, children: [] }
      sections.push(currentSection)
    } else {
      currentSection?.children.push(heading)
    }
  }

  return sections
}

export function searchForDocument(search: string, documentId: string) {
  const params = new URLSearchParams(search)
  params.delete('page')
  params.set('doc', documentId)
  return `?${params.toString()}`
}

export function searchForPage(search: string, pageId: string) {
  const params = new URLSearchParams(search)
  params.set('page', pageId)
  return `?${params.toString()}`
}

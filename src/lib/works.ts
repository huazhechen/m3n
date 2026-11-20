import { getWorks, loadWorkSource } from 'virtual:m3n-works-catalog'

export { getWorks }
export type Work = Awaited<ReturnType<typeof getWorks>>[number]

export async function loadWorkScore(slug: string) {
  const work = (await getWorks()).find(work => work.slug === slug)
  return work ? loadWorkSource(work) : null
}

import { getWorks, loadWorkSource } from 'virtual:m3n-works-catalog'
import { preloadScoreFonts } from './preload-score-fonts'

export { getWorks }
export type Work = Awaited<ReturnType<typeof getWorks>>[number]

export async function loadWorkScore(slug: string, systemCjk = false) {
  const work = (await getWorks()).find(work => work.slug === slug)
  if (work && !systemCjk) preloadScoreFonts(work.fontPreloads)
  return work ? loadWorkSource(work) : null
}

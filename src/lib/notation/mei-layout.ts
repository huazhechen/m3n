import { planPlayback, type PlaybackNavigation } from './repeats'
import { escapeXml } from './mei-xml'

export type MeiLayoutNode = {
  kind: 'section' | 'ending'
  id: string
  n?: string
  content: string
  repeatStart?: boolean
  repeatCount?: number
  navigation?: PlaybackNavigation[]
}

export function meiSectionContent(nodes: readonly MeiLayoutNode[], hasNavigation: boolean) {
  const needsExpansion = hasNavigation || nodes.some((node) => node.kind === 'ending' || node.repeatCount)
  const expansion = needsExpansion ? planPlayback(nodes).sequence : []
  return [
    ...(needsExpansion ? [`<expansion xml:id="m3n-expansion" plist="${expansion.map((id) => `#${id}`).join(' ')}"/>`] : []),
    ...nodes.map((node) => !needsExpansion ? node.content
      : node.kind === 'ending'
        ? `<ending xml:id="${node.id}" n="${escapeXml(node.n ?? '')}">\n${node.content}\n</ending>`
        : `<section xml:id="${node.id}">\n${node.content}\n</section>`),
  ].join('\n')
}

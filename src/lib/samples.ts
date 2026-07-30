export type PresetScore = {
  slug: string
  title: string
  subtitle?: string
  composer?: string
  category: string
  hasLyrics: boolean
  hasBass: boolean
  searchText: string
  source: string
}

const scoreModules = import.meta.glob('../scores/**/*.m3n', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function slugFromPath(path: string) {
  return path.split('/').at(-1)?.replace(/\.m3n$/, '') ?? path
}

function readAttribute(source: string, name: string) {
  const match = new RegExp(`\\{${name}=([^}]+)\\}`).exec(source)
  return match?.[1].trim()
}

const notationAttributeNames = new Set([
  'key',
  '1',
  'transpose',
  'parts',
  'part',
  'rest',
  'chord',
  'lyrics',
])

function readMetadataValues(source: string) {
  return Array.from(source.matchAll(/\{([^=}\s]+)=([^}]*)\}/g))
    .filter((match) => !notationAttributeNames.has(match[1]))
    .map((match) => match[2].trim())
    .filter(Boolean)
}

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase('zh-Hans-CN').replace(/\s+/g, ' ').trim()
}

export const presetScores: PresetScore[] = Object.entries(scoreModules)
  .map(([path, source]) => {
    const slug = slugFromPath(path)
    const title = readAttribute(source, 'title') ?? slug
    const subtitle = readAttribute(source, 'subtitle')
    const composer = readAttribute(source, 'composer')
    const category = readAttribute(source, 'category') ?? '未分类'
    const hasLyrics = source.includes('{lyrics}')
    const hasBass = source.includes('{bass}')

    return {
      slug,
      title,
      subtitle,
      composer,
      category,
      hasLyrics,
      hasBass,
      searchText: normalizeSearchText([title, subtitle, composer, category, ...readMetadataValues(source)].filter(Boolean).join(' ')),
      source,
    }
  })
  .sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category, 'zh-Hans-CN')
    }

    return a.title.localeCompare(b.title, 'zh-Hans-CN')
  })

export const sampleM3N =
  presetScores.find((score) => score.slug === 'ode-to-joy')?.source ?? presetScores[0]?.source ?? ''

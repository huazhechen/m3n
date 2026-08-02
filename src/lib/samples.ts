export type PresetScore = {
  order: number
  slug: string
  title: string
  subtitle?: string
  singer?: string
  composer?: string
  keySignature: string
  timeSignature: string
  tempo: number
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

function orderFromSlug(slug: string) {
  const match = /^(\d{2})_(\d{5})$/.exec(slug)
  return match ? Number(match[1]) * 100_000 + Number(match[2]) : Number.MAX_SAFE_INTEGER
}

function readAttribute(source: string, name: string) {
  const match = new RegExp(`\\{${name}=([^}]+)\\}`).exec(source)
  return match?.[1].trim()
}

function readTimeSignature(source: string) {
  return source.match(/\{(\d+\/\d+)\}/)?.[1] ?? '4/4'
}

function readTempo(source: string) {
  const match = source.match(/\{(\d+)qpm\}/)
  return match ? Number(match[1]) : 120
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
    const singer = readAttribute(source, 'singer')
    const composer = readAttribute(source, 'composer')
    const keySignature = readAttribute(source, 'key') ?? 'C'
    const timeSignature = readTimeSignature(source)
    const tempo = readTempo(source)
    const hasLyrics = source.includes('{lyrics}')
    const hasBass = source.includes('{bass}')

    return {
      order: orderFromSlug(slug),
      slug,
      title,
      subtitle,
      singer,
      composer,
      keySignature,
      timeSignature,
      tempo,
      hasLyrics,
      hasBass,
      searchText: normalizeSearchText([title, subtitle, singer, composer, ...readMetadataValues(source)].filter(Boolean).join(' ')),
      source,
    }
  })
  .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))

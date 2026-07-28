export type PresetScore = {
  slug: string
  title: string
  subtitle?: string
  composer: string
  category: string
  source: string
}

const scoreModules = import.meta.glob('../scores/*.m3n', {
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

const categoryFallbacks: Record<string, string> = {
  'frere-jacques': '儿童民歌',
  'hot-cross-buns': '儿童民歌',
  'jingle-bells-chorus': '节日歌曲',
  'mary-had-a-little-lamb': '儿童民歌',
  'ode-to-joy': '古典主题',
  'scarborough-fair': '传统民谣',
  'twinkle-twinkle-little-star': '儿童民歌',
}

export const presetScores: PresetScore[] = Object.entries(scoreModules)
  .map(([path, source]) => {
    const slug = slugFromPath(path)

    return {
      slug,
      title: readAttribute(source, 'title') ?? slug,
      subtitle: readAttribute(source, 'subtitle'),
      composer: readAttribute(source, 'composer') ?? '佚名',
      category: readAttribute(source, 'category') ?? categoryFallbacks[slug] ?? '其他',
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

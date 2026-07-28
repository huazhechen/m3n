import odeToJoy from '../scores/ode-to-joy.m3n?raw'
import twinkleTwinkleLittleStar from '../scores/twinkle-twinkle-little-star.m3n?raw'

export type PresetScore = {
  slug: string
  title: string
  subtitle?: string
  composer: string
  category: string
  source: string
}

export const presetScores: PresetScore[] = [
  {
    slug: 'ode-to-joy',
    title: '欢乐颂',
    subtitle: '《第九交响曲》第四乐章主题',
    composer: '贝多芬',
    category: '古典主题',
    source: odeToJoy,
  },
  {
    slug: 'twinkle-twinkle-little-star',
    title: '小星星',
    subtitle: 'Twinkle, Twinkle, Little Star',
    composer: '法国民歌',
    category: '儿童民歌',
    source: twinkleTwinkleLittleStar,
  },
]

export const sampleM3N = presetScores[0].source

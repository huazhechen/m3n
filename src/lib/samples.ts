import frereJacques from '../scores/frere-jacques.m3n?raw'
import hotCrossBuns from '../scores/hot-cross-buns.m3n?raw'
import jingleBellsChorus from '../scores/jingle-bells-chorus.m3n?raw'
import maryHadALittleLamb from '../scores/mary-had-a-little-lamb.m3n?raw'
import odeToJoy from '../scores/ode-to-joy.m3n?raw'
import scarboroughFair from '../scores/scarborough-fair.m3n?raw'
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
  {
    slug: 'mary-had-a-little-lamb',
    title: '玛丽有只小羊羔',
    subtitle: 'Mary Had a Little Lamb',
    composer: '美国传统童谣',
    category: '儿童民歌',
    source: maryHadALittleLamb,
  },
  {
    slug: 'scarborough-fair',
    title: 'Scarborough Fair',
    subtitle: 'ABC 转写样本',
    composer: '英国传统民谣',
    category: '传统民谣',
    source: scarboroughFair,
  },
  {
    slug: 'frere-jacques',
    title: '两只老虎',
    subtitle: 'Frere Jacques',
    composer: '法国传统儿歌',
    category: '儿童民歌',
    source: frereJacques,
  },
  {
    slug: 'hot-cross-buns',
    title: 'Hot Cross Buns',
    subtitle: '英国传统童谣',
    composer: '英国传统童谣',
    category: '儿童民歌',
    source: hotCrossBuns,
  },
  {
    slug: 'jingle-bells-chorus',
    title: '铃儿响叮当',
    subtitle: 'Jingle Bells 副歌',
    composer: 'James Lord Pierpont',
    category: '节日歌曲',
    source: jingleBellsChorus,
  },
]

export const sampleM3N = presetScores[0].source

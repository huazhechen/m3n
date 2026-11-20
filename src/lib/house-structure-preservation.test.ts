import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../scores/${name}_01.m3n`, import.meta.url), 'utf8')

it.each(['ai_ru_chao_shui', 'bai_hua_lin', 'bei_jia_er_hu_pan', 'qian_si_xi', 'tong_hua_zhen', 'xing_xing_dian_deng'])(
  'keeps repeats and local houses without introducing named sections: %s', name => {
    const source = read(name)
    expect(source).not.toMatch(/\{order=|^===|^Ns\[/m)
    expect(source).toMatch(/\|\|:/)
    expect(source).toMatch(/:\|\|/)
    expect(source).toMatch(/^---V1$/m)
    expect(source).toMatch(/^---V2$/m)
    if (name === 'qian_si_xi') {
      expect(source).toContain('{segno}')
      expect(source).toContain('{ds}')
      expect(source).toMatch(/^---V1,V3$/m)
    }
  },
)

it('keeps the restored sections, visit order and key change in 枫', () => {
  const source = read('feng')
  expect(source).toContain('{order=A,A,B,A,C,B@Db}')
  expect([...source.matchAll(/^===(.+)$/gm)].map(match => match[1])).toEqual(['A', 'B', 'C'])
  expect(source).not.toMatch(/\{(?:tocoda|coda|segno|ds|dc|fine)\}|^Ns\[/m)
})

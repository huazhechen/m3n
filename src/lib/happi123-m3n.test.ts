import { describe, expect, it } from 'vitest'
import { happi123ToM3N } from './happi123-m3n'

describe('happi123ToM3N', () => {
  it('converts metadata, notes, and lyrics', () => {
    const source = [
      '{title:欢乐颂}',
      '{key_signature:1=#F4}',
      '{time_signature:3/4}',
      '{bpm:90}',
      '1 2_ 3- | 4 5 6 |||',
      '{lyric}欢 乐 颂{/lyric}',
    ].join('\n')
    const result = happi123ToM3N(source)

    expect(result.diagnostics).toEqual([])
    expect(result.output).toContain('{title=欢乐颂}')
    expect(result.output).toContain('{key=F#} {3/4} {90qpm}')
    expect(result.output).toContain('{composer=路德维希·范·贝多芬}')
    expect(result.output).toContain('{source=Happi123}')
    expect(result.output).toContain('1 (2) 3^')
    expect(result.output).toContain('{lyrics}\n欢 乐 颂\n{/}')
  })

  it('preserves singer and prefers header attributions declared in Happi123', () => {
    const result = happi123ToM3N('{title:安妮}\n{singer:王杰}\n{composer:王杰}\n{lyricist:陈乐融}\n{key_signature:C}\n{time_signature:4/4}\n1---|||')

    expect(result.output).toContain('{singer=王杰}')
    expect(result.output).toContain('{composer=王杰}')
    expect(result.output).toContain('{lyricist=陈乐融}')
    expect(result.output).not.toContain('{composer=约翰·丹佛}')
  })

  it('diagnoses lossy tuplets instead of silently discarding them', () => {
    const result = happi123ToM3N('(3: 1_ 2 3)')
    expect(result.diagnostics.some((message) => message.includes('三连音'))).toBe(true)
  })

  it.each([
    ['1=Bb4', 'Bb'],
    ['1=bB', 'Bb'],
    ['1=#F', 'F#'],
    ['F#', 'F#'],
  ])('normalizes Happi123 key %s', (sourceKey, expectedKey) => {
    const result = happi123ToM3N(`{title:调号}\n{key_signature:${sourceKey}}\n{time_signature:4/4}\n1---|||`)

    expect(result.output).toContain(`{key=${expectedKey}}`)
  })

  it('applies a group extension to the final tied note', () => {
    const result = happi123ToM3N('{title:连音}\n{key_signature:C}\n{time_signature:4/4}\n(11)--|||')

    expect(result.output).toContain('1~ 1^. |||')
    expect(result.diagnostics).toEqual([])
  })

  it('applies a shortening suffix only to the final note in a group', () => {
    const result = happi123ToM3N('{title:组后缀}\n{key_signature:C}\n{time_signature:3/4}\n(2g__2g)_ 1 1_ 1_|||')

    expect(result.output).toContain('((2e~)) (2e) 1 (1) (1) |||')
    expect(result.diagnostics).toEqual([])
  })

  it('ties standalone extension measures to the previous note', () => {
    const result = happi123ToM3N('{title:延音}\n{key_signature:C}\n{time_signature:4/4}\n1---|----|----|||')

    expect(result.output).toContain('1^^~ | 1^^~ | 1^^ |||')
    expect(result.diagnostics).toEqual([])
  })

  it('ties a standalone extension to the final note inside a group', () => {
    const result = happi123ToM3N('{title:组延音}\n{key_signature:C}\n{time_signature:4/4}\n7_(6_6)--|----|||')

    expect(result.output).toContain('(7) (6~) 6^.~ | 6^^ |||')
    expect(result.output).not.toContain('(7~)')
  })

  it('does not reinterpret a trill marker as a tie', () => {
    const result = happi123ToM3N('{title:颤音}\n{key_signature:C}\n{time_signature:4/4}\n(1{tip:震音}1tr~)--|||')

    expect(result.output).toContain('1~ {text=震音} 1^. {tr} |||')
    expect(result.output).not.toContain('1^.~')
  })

  it('switches between explicitly listed mixed meters by measure duration', () => {
    const result = happi123ToM3N('{title:混合拍号}\n{key_signature:C}\n{time_signature:6/8 9/8}\n111|1111.|111|1111.|||')

    expect(result.output).toContain('{6/8}\n1 1 1 | {9/8} 1 1 1 1. | {6/8} 1 1 1 | {9/8} 1 1 1 1. |||')
    expect(result.diagnostics).toEqual([])
  })

  it('preserves explicit inline meter changes', () => {
    const result = happi123ToM3N('{title:变拍}\n{key_signature:C}\n{time_signature:4/4}\n1111|{2/4}11|{4/4}1111|||')

    expect(result.output).toContain('1 1 1 1 | {2/4} 1 1 | {4/4} 1 1 1 1 |||')
    expect(result.diagnostics).toEqual([])
  })

  it('corrects a clearly inconsistent declared meter', () => {
    const result = happi123ToM3N('{title:错拍号}\n{key_signature:C}\n{time_signature:4/4}\n11|22|33|44|55|||')

    expect(result.output).toContain('{key=C} {2/4}')
    expect(result.diagnostics).toContain('源谱拍号与小节时值不符，已从 4/4 更正为 2/4')
  })

  it('ignores physical Happi123 score lines while preserving explicit breaks', () => {
    const result = happi123ToM3N('{title:换行}\n{key_signature:C}\n{time_signature:2/4}\n11|\n22|\n{br}\n33|||')

    expect(result.output.match(/\{br\}/g)).toHaveLength(1)
    expect(result.output).toContain('1 1 | 2 2 | {br}\n3 3 |||')
  })

  it('discards playback-only octave configuration', () => {
    const result = happi123ToM3N('{title:音区}\n{key_signature:C}\n{time_signature:4/4}\n{octave:-1}\n1---|||')

    expect(result.output).not.toContain('octave')
    expect(result.diagnostics).toEqual([])
  })

  it('converts alternative notation blocks to volta endings', () => {
    const result = happi123ToM3N('{title:替代谱}\n{key_signature:C}\n{time_signature:2/4}\n{+12%%34}|')

    expect(result.output).toContain('{volta=1}1 2{/} {volta=2}3 4{/} |')
    expect(result.diagnostics).toEqual([])
  })

  it('converts a single dal segno jump to an explicit part order', () => {
    const result = happi123ToM3N('{title:反复}\n{key_signature:C}\n{time_signature:2/4}\n11|{start}22|{DS}')

    expect(result.output).toContain('{parts=DS1 DS2 DS2}')
    expect(result.output).toContain('{part=DS1}')
    expect(result.output).toContain('{part=DS2}')
    expect(result.output).not.toMatch(/text=(?:D\.S\.|Segno|Coda)/)
  })

  it('converts da capo al fine to an explicit part order', () => {
    const result = happi123ToM3N('{title:返始}\n{key_signature:C}\n{time_signature:2/4}\n11|{fine}22|{dc}')

    expect(result.output).toContain('{parts=DC1 DC2 DC1}')
    expect(result.output).toContain('{part=DC1}')
    expect(result.output).toContain('{part=DC2}')
    expect(result.output).not.toMatch(/text=(?:D\.C\.|Fine)/)
  })

  it('uses ordinary section bars inside parts and adds a missing document terminator', () => {
    const partResult = happi123ToM3N('{title:分段}\n{key_signature:C}\n{time_signature:2/4}\n{play:A}\nA: 11|||')
    const plainResult = happi123ToM3N('{title:结尾}\n{key_signature:C}\n{time_signature:2/4}\n11|22')

    expect(partResult.output).toContain('{part=A} 1 1 || {/}')
    expect(partResult.output).not.toContain('|||')
    expect(plainResult.output).toContain('1 1 | 2 2 |||')
  })

  it('converts double-brace Happi123 intervals to lyric-free instrumental intervals', () => {
    const result = happi123ToM3N('{title=前奏}\n{key_signature:C}\n{time_signature:2/4}\n{{{rest:2}11}}|22|||')

    expect(result.output).toContain('{inst}{rest=2} 1 1{/} | 2 2 |||')
  })

  it('does not promote a Happi123 repeat-section bar into a document terminator', () => {
    const result = happi123ToM3N('{title:反复段}\n{key_signature:C}\n{time_signature:2/4}\n11:||22|||')

    expect(result.output).toContain('1 1 :|| 2 2 |||')
    expect(result.output).not.toContain('1 1 :||| 2 2')
  })

  it('preserves slash lyric placeholders and assigns separate verses to passes', () => {
    const result = happi123ToM3N('{title:歌词}\n{key_signature:C}\n{time_signature:2/4}\n11:|||\n{lyric}甲/乙{/lyric}\n{lyric}丙/丁{/lyric}')

    expect(result.output).toContain('{lyrics=1}\n甲 % 乙\n{/}')
    expect(result.output).toContain('{lyrics=2}\n丙 % 丁\n{/}')
  })
})

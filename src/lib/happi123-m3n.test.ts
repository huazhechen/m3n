import { describe, expect, it } from 'vitest'
import { happi123ToM3N } from './happi123-m3n'
import { formatM3N } from './m3n-format'
import { m3nToMei } from './m3n-mei'

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
    expect(result.output).not.toContain('{source=Happi123}')
    expect(result.output).toContain('1 (2) 3^')
    expect(result.output).toContain('{lyrics}\n欢 乐 颂\n{/}')
  })

  it('preserves singer and prefers header attributions declared in Happi123', () => {
    const result = happi123ToM3N('{title:安妮}\n{category:华语流行}\n{singer:王杰}\n{composer:王杰}\n{lyricist:陈乐融}\n{key_signature:C}\n{time_signature:4/4}\n1---|||')

    expect(result.output).toContain('{category=华语流行}')
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

    expect(result.output).toContain('((2e~)) (2e) 1 (1 1) |||')
    expect(result.diagnostics).toEqual([])
  })

  it('ties standalone extension measures to the previous note', () => {
    const result = happi123ToM3N('{title:延音}\n{key_signature:C}\n{time_signature:4/4}\n1---|----|----|||')

    expect(result.output).toContain('1^^~ | 1^^~ | 1^^ |||')
    expect(result.diagnostics).toEqual([])
  })

  it('ties a standalone extension to the final note inside a group', () => {
    const result = happi123ToM3N('{title:组延音}\n{key_signature:C}\n{time_signature:4/4}\n7_(6_6)--|----|||')

    expect(result.output).toContain('(7 6~) 6^.~ | 6^^ |||')
    expect(result.output).not.toContain('(7~)')
  })

  it('does not turn a single parenthesized note into a ligature group', () => {
    const result = happi123ToM3N('{title:单音括号}\n{key_signature:C}\n{time_signature:2/4}\n(1//) 2 |||')

    expect(result.output).toContain('((1)) 2 |||')
    expect(result.output).not.toContain('{lg}')
    expect(m3nToMei(result.output).mei).not.toMatch(/<slur startid="#([^"\n]+)" endid="#\1"/)
  })

  it('does not turn a single parenthesized note with a trailing accidental into a ligature group', () => {
    const result = happi123ToM3N('{title:单音升号}\n{key_signature:C}\n{time_signature:2/4}\n(4x#) 2 |||')

    expect(result.output).toContain('(4#) 2 |||')
    expect(result.output).not.toContain('{lg}')
  })

  it('attaches Happi123 grace-note groups to their following main note', () => {
    const result = happi123ToM3N('{key_signature:C}\n{time_signature:2/4}\n(5g6g)@7g/st |')

    expect(result.diagnostics).toEqual([])
    expect(result.output).toContain('(7e){ac(5e6e)}')
  })

  it('keeps spaced duration extensions on their preceding note', () => {
    const result = happi123ToM3N('{title:延音}\n{key_signature:C}\n{time_signature:3/4}\n(6, - -|6, --) |||')

    expect(result.output).toContain('6d^.~ | 6d^. |||')
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

  it('converts inline Happi123 time signatures after the initial header', () => {
    const result = happi123ToM3N('{key_signature:C}\n{time_signature:4/4}\n1111|{time_signature:2/4}11|{time_signature:4/4}1111|||')

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

    expect(result.output).toContain('{volta=1}1 2{/} || {volta=2}3 4{/} |')
    expect(result.diagnostics).toEqual([])
  })

  it('closes Happi123 volta blocks before their final repeat bar', () => {
    const result = happi123ToM3N('{title:房子}\n{key_signature:C}\n{time_signature:2/4}\n|:11[1:22:|]')

    expect(result.output).toContain('{volta=1}2 2{/} :||')
    expect(result.diagnostics).toEqual([])
  })

  it('converts a Happi123 pickup repeat into a native incomplete-measure repeat', () => {
    const result = happi123ToM3N('{key_signature:C}\n{time_signature:4/4}\n1_2_|3456|123:|4|567|||')

    expect(result.output).toContain('(1 2) | 3 4 5 6 | 1 2 3 :|| 4 | 5 6 7 |||')
    expect(result.diagnostics).toEqual([])
  })

  it('preserves a Happi123 final volta followed by a regular barline', () => {
    const result = happi123ToM3N('{title:房子}\n{key_signature:C}\n{time_signature:2/4}\n|:11[1:22:|][2:33]|44|||')

    expect(result.output).toContain('{volta=1}2 2{/} :|| {volta=2}3 3{/} | 4 4')
    expect(result.diagnostics).toEqual([])
  })

  it('converts a single dal segno jump to direct M3N navigation', () => {
    const result = happi123ToM3N('{title:反复}\n{key_signature:C}\n{time_signature:2/4}\n11|{start}22|{DS}')

    expect(result.output).toContain('1 1 | {segno} 2 2 {ds}| |||')
  })

  it('moves a D.S. marker before its preceding repeat end before adding the terminal bar', () => {
    const result = happi123ToM3N('{title:直到世界的尽头}\n{key_signature:C}\n{time_signature:4/4}\n1---:|{ds}')

    expect(result.output).toContain('1^^ {ds}:|||')
  })

  it('keeps fine immediately before the terminal bar', () => {
    const result = happi123ToM3N('{title:返始}\n{key_signature:C}\n{time_signature:2/4}\n11|22{fine}|||')

    expect(result.output).toContain('1 1 | 2 2 {fine} |||')
  })

  it('moves fine before the Happi123 barline that precedes it', () => {
    const result = happi123ToM3N('{title:返始}\n{key_signature:C}\n{time_signature:2/4}\n11:|{fine}|||')

    expect(result.output).toContain('1 1 {fine}:|||')
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

  it('converts Happi123 repeat counts to M3N repeat-count markers', () => {
    const result = happi123ToM3N('{title:重复次数}\n{key_signature:C}\n{time_signature:2/4}\n|:11:|{repeat:3}|||')

    expect(result.output).toContain('||: 1 1 :||{x3} |||')
    expect(result.diagnostics).toEqual([])
  })

  it('turns a terminal Happi123 repeat count into a terminal repeat bar', () => {
    const result = happi123ToM3N('{title:终止反复}\n{key_signature:C}\n{time_signature:2/4}\n11|22|||{repeat:3}')

    expect(result.output).toContain('1 1 | 2 2 :|||{x3}')
    expect(result.output).not.toContain(':|||{x3} |||')
    expect(result.diagnostics).toEqual([])
  })

  it('preserves Happi123 forced tied lyrics and grouped lyric items', () => {
    const result = happi123ToM3N(
      '{title:歌词方言}\n{key_signature:C}\n{time_signature:2/4}\n1~ 1 |||\n{lyric}甲+乙_(丙丁){/lyric}',
    )

    expect(result.output).toContain('{lyrics}\n甲 +乙 % (丙丁)\n{/}')
  })

  it.each(['_', ';'])('omits Happi123 %s placeholders at automatic M3N tied targets', (placeholder) => {
    const result = happi123ToM3N(
      `{key_signature:C}\n{time_signature:4/4}\n1~ 1 2 2 |||\n{lyric}\u7532${placeholder}\u4e59\u4e19{/lyric}`,
    )

    expect(result.output).toContain('{lyrics}\n\u7532 \u4e59 \u4e19\n{/}')
    expect(result.output).not.toContain('{lyrics}\n\u7532 %')
  })

  it('realigns a placeholder after an implicit tied target', () => {
    const result = happi123ToM3N(
      '{key_signature:C}\n{time_signature:3/2}\n1~ 1 2~ 2 3 4 |||\n{lyric}a b/c d{/lyric}',
    )

    expect(result.output).toContain('{lyrics}\na b c d\n{/}')
  })

  it('preserves slash lyric placeholders and assigns separate verses to passes', () => {
    const result = happi123ToM3N('{title:歌词}\n{key_signature:C}\n{time_signature:2/4}\n11:|||\n{lyric}甲/乙{/lyric}\n{lyric}丙/丁{/lyric}')

    expect(result.output).toContain('{lyrics=1}\n甲 % 乙\n{/}')
    expect(result.output).toContain('{lyrics=2}\n丙 % 丁\n{/}')
  })

  it('converts ASCII semicolons in Happi123 lyrics to alignment placeholders', () => {
    const result = happi123ToM3N('{title:歌词}\n{key_signature:C}\n{time_signature:2/4}\n11|||\n{lyric}甲;乙；丙{/lyric}')

    expect(formatM3N(result.output)).toContain('{lyrics}\n甲%乙；丙\n{/}')
  })
})

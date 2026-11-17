import { describe, expect, it } from 'vitest' 
import { formatM3N, normalizeSectionBarlines } from './m3n-format.js'
import { parseM3NDocument } from './m3n-direct.js'
import { validateM3NDiagnostics } from './m3n-validate.js'

describe('formatM3N', () => {
  it('formats the current phrase structure without rewriting music atoms', () => {
    const source = '{title=Test Song}   {key=C}  {4/4}\nN:  1~  1  2  3  |  4  5  6  7  :||{x2}\nL1:  你 好  %  世 界\nL2:  Hello   world  again  now\n--- V1 , V2\nN:  [135:h]{arp}  0  0  0  |||\n'

    expect(formatM3N(source)).toBe([
      '{title=Test Song} {key=C} {4/4}',
      'N: 1~ 1 2 3 | 4 5 6 7 :||{x2}',
      'L1: 你好% | 世界',
      'L2: Hello world again | now',
      '---V1,V2',
      'N: [135:h]{arp} 0 0 0 |||',
      '',
    ].join('\n'))
  })

  it('preserves all tied event boundaries', () => {
    expect(formatM3N('{4/4}\nN: 1~ 1 2 3 |||')).toContain('N: 1~ 1 2 3 |||')
    expect(formatM3N('{4/4}\nN: 2 1~ 1 3 |||')).toContain('N: 2 1~ 1 3 |||')
  })

  it('preserves comments and directive values while normalizing surrounding whitespace', () => {
    const source = '{title=A  B}  {text=  dolce  } // heading\nN: {p}1{text=keep  spaces}  2  3  4  // phrase\n'

    expect(formatM3N(source)).toBe([
      '{title=A  B} {text=  dolce  }  // heading',
      'N: {p}1{text=keep  spaces} 2 3 4  // phrase',
      '',
    ].join('\n'))
  })

  it('is idempotent and retains strict lyric and house validation', () => {
    const source = '{key=C} {2/4}\n\nN: 1 2 |\n---V1\nN: 3 4 |\nL: 甲乙\n\n---V2\nN: 5 6 |||\nL: 丙丁\n'
    const formatted = formatM3N(source)

    expect(formatM3N(formatted)).toBe(formatted)
    expect(formatted).not.toContain('\n\n')
    expect(validateM3NDiagnostics(formatted)).toEqual([])
  })

  it('preserves directive text without splitting long phrases', () => {
    const source = `{title=A  B} {2/4}\nN: ${'1 2 | '.repeat(17)}\nL: ${'甲'.repeat(34)}`
    const formatted = formatM3N(source)

    expect(formatted).toContain('{title=A  B}')
    expect(formatted.match(/^N:/gm)).toHaveLength(1)
    expect(formatted).not.toContain('\n---\n')
    expect(formatted).toContain(`N: ${'1 2 | '.repeat(17).trim()}`)
  })

  it('preserves manual breaks and groups adjacent sixteenth notes by beat', () => {
    const source = '{4/4}\nN: {br} ((1)) ((2)) ((3)) ((4)) | ((5)) ((6)) ((7)) ((1e)) |||\n'

    expect(formatM3N(source)).toBe('{4/4}\nN: {br} ((1 2 3 4)) | ((5 6 7 1e)) |||\n')
  })

  it('removes a redundant ordinary bar at the start of a phrase', () => {
    const source = '{2/4}\nN: 1 2 |\n---\nN: | 3 4 |||\n'

    expect(formatM3N(source)).toContain('---\nN: 3 4 |||')
    expect(validateM3NDiagnostics(formatM3N(source))).toEqual([])
  })

  it('collapses consecutive music barlines without removing empty lyric measures', () => {
    const source = '{2/4}\nN: 1 2 | | 0^ || | 3 4 | |||\nL: 甲乙 | | 丙丁\n'
    const formatted = formatM3N(source)

    expect(formatted).toContain('N: 1 2 | 0^ || 3 4 |||')
    expect(formatted).toContain('L: 甲乙 | | 丙丁')
  })

  it('adds lyric measure bars from the melody alignment', () => {
    const source = '{2/4}\nN: 1 2 | 3 4 |||\nL: 甲乙丙丁\n'

    expect(formatM3N(source)).toBe('{2/4}\nN: 1 2 | 3 4 |||\nL: 甲乙 | 丙丁\n')
  })

  it('preserves empty lyric measures when adding alignment bars', () => {
    const middle = '{2/4}\nN: 1 2 | 0^ | 3 4 |||\nL: 甲乙 | 丙丁\n'
    const consecutive = '{2/4}\nN: 0^ | 0^ | 1 2 |||\nL: 甲乙\n'

    expect(formatM3N(middle)).toContain('L: 甲乙 | | 丙丁')
    expect(formatM3N(consecutive)).toContain('L: | | 甲乙')
    expect(formatM3N(formatM3N(middle))).toBe(formatM3N(middle))
    expect(formatM3N(formatM3N(consecutive))).toBe(formatM3N(consecutive))
  })

  it('keeps CJK spacing stable when an explicit lyric bar cannot be reconstructed', () => {
    const source = '{4/4}\nN: 1^^~ | 1^. 2 |||\nL: 甲 | 乙丙\n'
    const formatted = formatM3N(source)
    expect(formatM3N(formatted)).toBe(formatted)
    expect(parseM3NDocument(formatted).lyrics.map(block => block.syllables.map(item => item.text)))
      .toEqual(parseM3NDocument(source).lyrics.map(block => block.syllables.map(item => item.text)))
  })

  it('counts forced tied-target lyrics when rebuilding measure bars', () => {
    const source = '{2/4}\nN: 1~ 1 | 2 3 |||\nL: 甲+乙 | 丙丁\n'

    expect(formatM3N(source)).toContain('L: 甲+乙 | 丙丁')
    expect(validateM3NDiagnostics(formatM3N(source))).toEqual([])
  })

  it('rebuilds measure alignment for every repeated verse', () => {
    const source = '{2/4}\nN: ||: 1 2 | 3 4 :||{x2} |||\nL1: 甲乙丙丁\nL2: 戊己庚辛\n'
    const diagnostics = validateM3NDiagnostics(formatM3N(source))

    expect(diagnostics.filter((item) => item.code === 'M3N_LYRIC_ALIGNMENT')).toEqual([])
  })

  it('splits compressed lyric placeholders across measures', () => {
    const source = '{2/4}\nN: 1 2 | 3 4 | 5 6 |||\nL: 甲%乙丙丁戊\n'
    const diagnostics = validateM3NDiagnostics(formatM3N(source))

    expect(diagnostics.filter((item) => item.code === 'M3N_LYRIC_ALIGNMENT')).toEqual([])
  })
})

// Every fixture here exposed a semantic or stability regression in the old formatter.
describe('formatter semantic guarantees', () => {
  const valid = (source: string) => {
    expect(validateM3NDiagnostics(source)).toEqual([])
    const formatted = formatM3N(source)
    expect(validateM3NDiagnostics(formatted)).toEqual([])
    expect(formatM3N(formatted)).toBe(formatted)
    return formatted
  }

  it('cancels redundant parentheses against duration multipliers', () => {
    expect(valid('{4/4}\nN: (1^) (2^) 3 4 |||')).toContain('N: 1 2 3 4 |||')
    expect(valid('{4/4}\nN: ((1^^)) ((2^^)) 3 4 |||')).toContain('N: 1 2 3 4 |||')
  })

  it('preserves sustained values as single events', () => {
    expect(formatM3N('{4/4}\nN: 3 (4) 5. 3 |||')).toBe('{4/4}\nN: 3 (4) 5. 3 |||\n')
    expect(valid('{4/4}\nN: 1 (2^^.) |||')).toContain('N: 1 2^. |||')
    valid('{6/8}\nN: (1 2^^ 3) |||')
  })

  it.each([6, 9, 12])('groups %i/8 in dotted beats', (count) => {
    const notes = Array.from({ length: count }, (_, i) => `(${i % 7 + 1})`).join(' ')
    const formatted = valid(`{${count}/8}\nN: ${notes} |||`)
    const groups = Array.from({ length: count / 3 }, (_, group) =>
      `(${Array.from({ length: 3 }, (_, i) => (group * 3 + i) % 7 + 1).join(' ')})`).join(' ')
    expect(formatted).toContain(`N: ${groups} |||`)
  })

  it('respects offsets after quarter notes and inline meter changes', () => {
    expect(valid('{6/8}\nN: 1 (2) (3) (4) (5) |||')).toContain('N: 1 (2) (3 4 5) |||')
    expect(valid('{2/4}\nN: (1) (2) (3) (4) | {6/8}(1) (2) (3) (4) (5) (6) |||'))
      .toContain('{6/8}(1 2 3) (4 5 6)')
  })

  it('uses compound grouping for bass and alternate melodies too', () => {
    const source = '{6/8}\nN: ||: 1. 2. :|||\nB: (1) (2) (3) (4) (5) (6) |\nNs[2]: 1: (7) (6) (5) (4) (3) (2) |'
    const formatted = valid(source)
    expect(formatted).toContain('B: (1 2 3) (4 5 6) |')
    expect(formatted).toContain('Ns[2]: 1: (7 6 5) (4 3 2) |')
  })

  it('preserves literal grouped lyric text', () => {
    expect(valid('{2/4}\nN: (1 2) 3 |||\nL: (春 天)来风')).toContain('L: (春 天)来风')
  })

  it('retains ties crossing dotted beat boundaries', () => {
    expect(valid('{9/8}\nN: (1) 2^~ 2^ |||')).not.toContain('2^^')
    expect(valid('{12/8}\nN: (1) 2~ 2 3. 4 5 |||')).not.toContain('2^')
  })

  it('retains slur endpoints when simplifying ties', () => {
    expect(valid('{4/4}\nN: {lg}1~ 1{/} 2 3 |||')).toContain('{lg}1~ 1{/}')
  })

  it('preserves English word boundaries across lyric barlines', () => {
    expect(valid('{2/4}\nN: 1 2 | 3 4 |||\nL: Hello world | sing now'))
      .toContain('L: Hello world | sing now')
  })

  it('protects literal barlines, break text and comments', () => {
    const formatted = valid('{4/4}\nN: {br}{text=keep | | this}1 2 3 4 ||| // keep | | {br} %%')
    expect(formatted).toContain('{text=keep | | this}')
    expect(formatted).toContain('// keep | | {br} %%')
    expect(formatted).toContain('N: {br}')
    expect(formatM3N('{2/4}\nN: 1 2 |||\nL: Hello world // %% | | {br}'))
      .toContain('// %% | | {br}')
  })
})

describe('canonical note scopes', () => {
  it('preserves short tied notes and separate rests', () => {
    expect(formatM3N('{2/4}\nN: (1~ 1) 2 |||')).toContain('N: (1~ 1) 2 |||')
    expect(formatM3N('{2/4}\nN: ((0 0 0 0)) 1 |||')).toContain('N: ((0 0 0 0)) 1 |||')
    expect(formatM3N('{2/4}\nN: ((0 0)) (0) 0 |||')).toContain('N: ((0 0) 0) 0 |||')
  })

  it('preserves unsupported outer scopes and their nested duration scaling', () => {
    const source = '{2/4}\nN: ({p}(1) (2) 3) 4 |||'
    const formatted = formatM3N(source)
    expect(validateM3NDiagnostics(formatted)).toEqual([])
    expect(formatted).toContain('({p}(1) (2) 3)')
    expect(parseM3NDocument(formatted).parts.get('score')!.melody[0]!.events.map(event => event.beats))
      .toEqual([0.25, 0.25, 0.5, 1])
  })

  it('separates notes when removing adjacent scopes', () => {
    expect(formatM3N('{4/4}\nN: 1(2^)3 4 |||')).toContain('N: 1 2 3 4 |||')
  })
})

it('preserves timing and reaches a stable spelling across varied nested rhythms', () => {
  let seed = 7341
  const random = (size: number) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % size }
  const spans = (source: string) => [...parseM3NDocument(source).parts.values()].flatMap(part => part.melody.map(measure => {
    return measure.events.map(event => ({ pitches: event.pitches, kind: event.kind, beats: event.beats, tie: event.tie }))
  }))
  for (const [count, unit] of [[2, 4], [3, 4], [4, 4], [6, 8], [9, 8], [12, 8]]) {
    for (let sample = 0; sample < 30; sample += 1) {
      let remaining = count! * 16 / unit!
      const notes: string[] = []
      while (remaining) {
        const choices = [1, 2, 4, 8].filter(ticks => ticks <= remaining)
        const ticks = choices[random(choices.length)]!
        const power = Math.log2(ticks) - 2
        const extra = random(3)
        const depth = Math.max(0, -power) + extra
        const carets = Math.max(0, power) + extra
        const pitch = random(4) === 0 ? '0' : '1'
        const tied = pitch !== '0' && remaining > ticks && random(2) === 0
        notes.push('('.repeat(depth) + pitch + '^'.repeat(carets) + (tied ? '~' : '') + ')'.repeat(depth))
        remaining -= ticks
      }
      const source = `{${count}/${unit}}\nN: ${notes.join(' ')} |||`
      const formatted = formatM3N(source)
      expect(spans(formatted), source).toEqual(spans(source))
      expect(validateM3NDiagnostics(formatted), source).toEqual(validateM3NDiagnostics(source))
      expect(formatM3N(formatted), source).toBe(formatted)
    }
  }
})


describe('ordinary phrase double barlines', () => {
  it('normalizes internal phrase endings and synchronized bass/chord rows only', () => {
    const source = '{2/4}\nN: 1 2 || // ending\nB: 1d 2d ||\nC: C G ||\nL: 甲乙\n---\nN: 3 4 |||\n'
    const expected = source.replaceAll('|| //', '| //').replace('2d ||', '2d |').replace('G ||', 'G |')
    expect(normalizeSectionBarlines(source)).toBe(expected)
    expect(formatM3N(formatM3N(source))).toBe(formatM3N(source))
  })
  it.each([
    '===B\nN: 3 4 |||',
    '---V1\nN: 3 4 :||',
    '---\nN: {text=新练习}3 4 |||',
    '---\nN: {key=D}3 4 |||',
    '---\nN: {3/4}3 4 5 |||',
    '---\nN: {inst}3 4{/} |||',
    '---\nN: ||: 3 4 :||',
  ])('preserves explicit structure before %s', tail => {
    const source = `{2/4}\nN: 1 2 ||\n${tail}`
    expect(normalizeSectionBarlines(source)).toBe(source)
  })
  it.each(['{ds}', '{dc}', '{fine}', '{inst}'])('preserves navigation and instrumental rows: %s', directive => {
    const source = `{2/4}\nN: ${directive}1 2 ||\n---\nN: 3 4 |||`
    expect(normalizeSectionBarlines(source)).toBe(source)
  })
  it('preserves final, internal, repeated and manual-break bars and literal text', () => {
    const source = '{title=keep ||}\nN: {text=keep ||}1 2 || 3 4 ||{br} // keep ||\n---\nN: 5 6 ||'
    expect(normalizeSectionBarlines(source)).toBe(source)
  })
  it('preserves house-ending bars', () => {
    const source = '{2/4}\n---V2\nN: 1 2 ||\n---\nN: 3 4 |||'
    expect(normalizeSectionBarlines(source)).toBe(source)
  })
})


it('keeps the end of an instrumental interval opened in an earlier phrase', () => {
  const source = '{2/4}\nN: {inst}1 2 |\n---\nN: 3 4{/} ||\n---\nN: 5 6 |||\nL: 甲乙'
  expect(normalizeSectionBarlines(source)).toBe(source)
})

import { describe, expect, it } from 'vitest'
import { invalidMeasureBarEnds, invalidMeasureIds, validateM3N, validateM3NDiagnostics } from './m3n-validate'
import { parseM3NDocument } from './m3n-direct'

const messages = (source: string) => validateM3N(source).join('\n')

describe('validateM3N', () => {
  it('exposes structured diagnostics without changing legacy messages', () => {
    const source = '{2/4}\n1 2 |||\n{lyrics}la{/}'
    const diagnostics = validateM3NDiagnostics(source)

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      code: 'M3N_LYRIC_ALIGNMENT',
      severity: 'warning',
      legacyMessage: validateM3N(source)[0],
      range: { start: source.indexOf('{lyrics}'), end: source.length },
    })
  })

  it('reuses an already parsed document for validation and measure markers', () => {
    const source = '{4/4}\n1 2 3 | 1 2 3 4 |||'
    const document = parseM3NDocument(source)

    expect(validateM3N(source, {}, document)).toEqual(validateM3N(source))
    expect(validateM3NDiagnostics(source, {}, document)).toEqual(validateM3NDiagnostics(source))
    expect(invalidMeasureIds(source, document)).toEqual(invalidMeasureIds(source))
  })

  it('accepts a complete unsegmented score', () => {
    expect(validateM3N('{title=Test}\n{key=C} {4/4} {120qpm}\n1 2 3 4 |||')).toEqual([])
  })

  it('locates the closing barline of invalid measures', () => {
    const source = '{4/4}\n1 2 3 4 | 1 2 3 | 1 2 3 4 |||'
    const invalidBar = source.indexOf('|', source.indexOf('|') + 1)

    expect(invalidMeasureBarEnds(source)).toEqual([invalidBar + 1])
    expect(invalidMeasureIds(source)).toEqual(['m3n-measure-1-2'])
    expect(messages(source)).toContain('第 2 行，第 2 小节：中间小节拍数不合规')
  })

  it('does not count a leading repeat bar as a rendered measure', () => {
    const source = '{4/4}\n||: 1 2 3 4 | 1 2 3 | 1 2 3 4 |||'

    expect(invalidMeasureIds(source)).toEqual(['m3n-measure-1-2'])
  })

  it('accepts tenuto and fermata postfixes', () => {
    expect(validateM3N('{key=C} {4/4}\n1{hold} 2{fermata} 3 4 |||')).toEqual([])
  })

  it('accepts arpeggios on chord groups only', () => {
    expect(validateM3N('{key=C} {4/4}\n[135:h]{arp} 0 0 0 |||')).toEqual([])
    expect(messages('{key=C} {4/4}\n1{arp} 2 3 4 |||')).toContain('琶音只能附在和音组之后')
  })

  it('validates tempo-ramp targets and bass restrictions', () => {
    expect(validateM3N('{4/4} {120qpm}\n{accel=144}1 2 3 4{/} |||')).toEqual([])
    expect(messages('{4/4}\n{rit=0}1 2 3 4{/} |||')).toContain('渐快或渐慢的目标速度必须是正整数')
    expect(messages('{4/4}\n1 2 3 4 |||\n{bass}{rit=80}1 2 3 4{/}|||{/}')).toContain('低音谱表内不能声明渐快或渐慢')
  })

  it('validates basic repeat navigation markers', () => {
    expect(validateM3N('{4/4}\n{segno}1 2 3 4 | 5 6 7 1e{fine} ||| 1 2 3 4{ds} ||')).toEqual([])
    expect(messages('{4/4}\n{segno}1 2 3 4 | {segno}1 2 3 4 |||')).toContain('segno 最多只能使用一次')
    expect(messages('{4/4}\n1 2 3 4{ds} |||')).toContain('ds 必须配合唯一的 segno')
  })

  it('allows multiple implicit repeats from the beginning of a validation unit', () => {
    expect(validateM3N('{2/4}\n1 2 :|| 3 4 :|||')).toEqual([])
  })

  it('accepts complementary incomplete measures across a repeat boundary', () => {
    const source = '{4/4}\n(1 2) | 3 4 5 6 | 1 2 3 :|| 4 | 5 6 7 |||'

    expect(validateM3N(source)).toEqual([])
    expect(messages('{4/4}\n(1 2) | 3 4 5 6 | 1 2 :|| 4 | 5 6 7 |||')).toContain('中间小节拍数不合规')
  })

  it('accepts a repeat start in the middle of a measure when both playback paths complete it', () => {
    const source = '{4/4}\n1 2 3 ||: 4 | 5 6 7 1 | 2 3 4 :|| 5 | 6 7 1 2 |||'

    expect(validateM3N(source)).toEqual([])
    expect(messages('{4/4}\n1 2 ||: 3 | 4 5 6 7 | 1 2 3 :|| 4 | 5 6 7 1 |||')).toContain('中间小节拍数不合规')
  })

  it('accepts independent pickup measures in named parts without terminal bars', () => {
    const source = [
      '{parts=A B A}',
      '{key=C} {4/4}',
      '{part=A} 1 | 1 2 3 4 | 2 3 4 || {/part}',
      '{part=B} 5 | 1 2 3 4 | 6 7 1 || {/}',
    ].join('\n')
    expect(validateM3N(source)).toEqual([])
  })

  it('accepts rests and insignificant whitespace in tuplet groups', () => {
    expect(validateM3N('{key=C} {2/4}\n[0 6 6 : 2] |||')).toEqual([])
  })

  it('allows a tie from the final pitched tuplet element only', () => {
    expect(validateM3N('{key=C} {4/4}\n[123~:2] 3 0 |||')).toEqual([])
    expect(messages('{key=C} {4/4}\n[123~:2] 4 0 |||')).toContain('延音目标的类型或绝对音高不匹配')
    expect(messages('{key=C} {4/4}\n[1~23:2] 3 0 |||')).toContain('元素序列含非法内容')
    expect(messages('{key=C} {4/4}\n[120~:2] 0 0 |||')).toContain('连音组内的延音只能附在最后一个有音高的元素上')
  })

  it('validates note, rest, group, and duration restrictions', () => {
    const result = messages('{4/4}\n1#b 2ed 1### 2bbb 0~ [10:h] [1:h] [123:0] [123:2]~ |||')
    expect(result).toContain('临时变音组合非法')
    expect(result).toContain('临时变音最多只能使用两个同类记号')
    expect(result).toContain('八度方向混用')
    expect(result).toContain('休止符不能使用音高修饰或延音')
    expect(result).toContain('和音组内不允许休止符')
    expect(result).toContain('音符分组至少需要两个元素')
    expect(result).toContain('分组模式必须是 h 或正整数')
    expect(result).toContain('连音组整体不能使用延音')
  })

  it('validates exact key, meter, tempo, chord, and range formats', () => {
    const result = messages([
      '{key=Cmaj} {3/3} {120QPM} {chord=VIII} {transpose=1.5}',
      '{volta=2~2}1 2 3 4{/} |||',
    ].join('\n'))
    expect(result).toContain('调号格式非法')
    expect(result).toContain('拍号格式非法')
    expect(result).toContain('qpm 必须使用小写')
    expect(result).toContain('和弦标记值非法')
    expect(result).toContain('transpose 必须是整数')
    expect(result).toContain('闭区间起点必须小于终点')
  })

  it('enforces metadata placement, uniqueness, and non-empty values', () => {
    const result = messages('{title=} {title=A}\n1 {composer=B} 2 3 4 |||')
    expect(result).toContain('乐谱信息值不能为空')
    expect(result).toContain('乐谱信息重复声明')
    expect(result).toContain('乐谱信息必须写在第一个音乐原子之前')
  })

  it('enforces stack order and reports missing or redundant closes', () => {
    const result = messages('{cresc}{lg}1 2 3 4{/cresc}{/lg}{/}{/} |||')
    expect(result).toContain('区间关闭顺序错误')
    expect(result).toContain('关闭指令没有对应开始')
  })

  it('enforces prefix and postfix attachment', () => {
    const result = messages('{4/4}\n{sfz}0 1{tr} {br}{ac(2)} 2 3 4 |||')
    expect(result).toContain('sfz 后方第一个元素必须是有音高')
    expect(result).toContain('后置指令必须紧跟有音高')
  })

  it('supports nested grace-note durations', () => {
    expect(validateM3N('{4/4}\n1{ac(2)} 2{ac((34))} 3{ap(((456)))} 4 |||')).toEqual([])
    expect(messages('{4/4}\n1{ac((2)} 2 3 4 |||')).toContain('装饰音必须使用同层配对的圆括号包裹音高序列')
  })

  it('validates ties by absolute pitch and atom type', () => {
    expect(messages('{key=D} {2/4}\n3b~ | 3= |||')).toContain('绝对音高不匹配')
    expect(messages('{key=C} {2/4}\n[13:h]~ | [14:h] |||')).toContain('绝对音高不匹配')
    expect(messages('{key=C} {2/4}\n1~ | 0 |||')).toContain('类型或绝对音高不匹配')
  })

  it('requires non-empty same-measure parentheses', () => {
    const result = messages('{4/4}\n() 1 (2 | 3 4 |||')
    expect(result).toContain('圆括号内至少需要一个音乐原子')
    expect(result).toContain('圆括号必须在同一小节内闭合')
  })

  it('requires a unique final terminal outside named parts', () => {
    expect(messages('{4/4}\n1 2 3 4 |')).toContain('必须且只能使用一次终止线')
    expect(messages('{4/4}\n1 2 3 4 ||| 1')).toContain('终止线之后不能再出现')
    expect(messages('{parts=A}\n{part=A}1 2 3 4 |||{/}')).toContain('具名乐段内不能使用终止线')
  })

  it('enforces named-part definitions and top-level structure', () => {
    const result = messages('{parts=A C}\n{part=A}1 2 3 4 ||{/}{key=G}\n{part=A}1 2 3 4 ||{/}')
    expect(result).toContain('乐段重复定义')
    expect(result).toContain('正文顶层只能继续定义 part')
    expect(result).toContain('乐段引用未定义：C')
  })

  it('enforces multi-measure-rest isolation', () => {
    const result = messages('{4/4}\n1 {rest=2} | ({rest=1}) | 1 2 3 4 |||')
    expect(result).toContain('多小节休止必须独占一个小节位置')
    expect(result).toContain('多小节休止不能使用圆括号修饰')
  })

  it('combines overlapping lyric ranges by playback pass', () => {
    const source = [
      '{2/4} 1 2 :|||',
      '{lyrics=1~2} one two {/}',
    ].join('\n')
    const result = messages(source)
    expect(result).toBe('')
  })

  it('prefixes lyric supplement structure diagnostics with [L]', () => {
    const diagnostics = [
      ...validateM3N('{2/4} 1 2 |||\n{lyrics}{inst}la la{/lyrics}{/}'),
      ...validateM3N('{2/4} 1 2 |||\n{lyrics}la la{/bass}'),
      ...validateM3N('{2/4} 1 2 |||\n{bass}{lyrics}la la{/}{/}'),
    ]

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.stringMatching(/^\[L\] .*区间关闭顺序错误/),
      expect.stringMatching(/^\[L\] .*补充块关闭名称错误/),
      expect.stringMatching(/^\[L\] .*补充块不能嵌套/),
    ]))
  })

  it('rejects lyric reuse that exceeds a shorter volta path', () => {
    const source = [
      '{2/4} ||: {volta=1}1 2{/} :|| {volta=2}1 0{/} :|||',
      '{lyrics}la la{/}',
    ].join('\n')
    expect(messages(source)).toContain('歌词对位数量不匹配：共享遍次需要 3 项，实际 2 项')
  })

  it('requires complete first-pass lyrics and permits only shorter later-pass lyrics', () => {
    const music = '{2/4} ||: {volta=1}1 2{/} :|| {volta=2}1 2{/} :|||'
    const valid = `${music}\n{lyrics=1}one two{/}\n{lyrics=2}three{/}`
    const incompleteFirstPass = `${music}\n{lyrics=1}one{/}\n{lyrics=2}three{/}`
    const overflowingLaterPass = `${music}\n{lyrics=1}one two{/}\n{lyrics=2}three four five{/}`

    expect(messages(valid)).not.toContain('歌词对位数量不匹配')
    expect(messages(incompleteFirstPass)).toContain('歌词对位数量不匹配：第 1 遍需要 2 项，实际 1 项')
    expect(messages(overflowingLaterPass)).toContain('歌词对位数量不匹配：第 2 遍需要 2 项，实际 3 项')
  })

  it('allows a regular barline after the final volta ending', () => {
    expect(validateM3N('{2/4} ||: 1 2 | {volta=1}3 4{/} :|| {volta=2}5 6{/} | 7 1e |||')).toEqual([])
  })

  it('allows structural markers but rejects music before a volta closing barline', () => {
    expect(validateM3N('{2/4} {segno} ||: 1 2 | {volta=1}3 4{/} {ds}:|||')).toEqual([])
    expect(messages('{2/4} ||: 1 2 | {volta=1}3 4{/} 5 6 |')).toContain('volta 关闭后、下一条小节线前不能出现音符')
  })

  it('allows a new volta group after ordinary music in the same outer repeat', () => {
    const source = '{2/4} ||: {volta=1}1 2{/} | {volta=2}3 4{/} | 5 6 | {volta=1}1 2{/} || {volta=2}3 4{/} | 5 6 :|||'

    expect(validateM3N(source)).toEqual([])
  })

  it('allows later lyric blocks to omit alignment positions', () => {
    const source = [
      '{2/4} 1 2 |||',
      '{lyrics=1}甲 乙{/}',
      '{lyrics=2}丙{/}',
      '{lyrics=3}丁{/}',
    ].join('\n')
    expect(validateM3N(source)).toEqual([])
  })

  it('rejects lyrics that exceed the D.S. return path', () => {
    const source = [
      '{2/4} {segno}1 2 | 3 4{ds} |||',
      '{lyrics=1}a b c d{/}',
      '{lyrics=2}a b c d e{/}',
    ].join('\n')

    expect(messages(source)).toContain('第 2 遍需要 4 项，实际 5 项')
  })

  it('validates named-part lyrics against their first playback only', () => {
    const source = [
      '{2/4} {parts=A B A}',
      '{part=A}1 2 ||{/}',
      '{part=B}3 4 ||{/}',
      '{lyrics=1}甲乙丙丁{/}',
      '{lyrics=2}戊己{/}',
    ].join('\n')
    expect(validateM3N(source)).toEqual([])
  })

  it('excludes instrumental intervals from lyric alignment', () => {
    expect(messages('{2/4} {inst}1 2{/} | 3 4 |||\n{lyrics}la la{/}')).toBe('')
  })

  it('allows + prefixed lyrics on tied note targets', () => {
    expect(messages('{3/4} 1~ 1 2 |||\n{lyrics}la +la la{/}')).toBe('')
  })

  it('rejects + prefixed lyrics when no tied target is available', () => {
    const source = '{4/4} 1 2 3 4 |||\n{lyrics}la +la la{/}'

    expect(messages(source)).toContain('[L] 第 2 行：第 1 遍的 +歌词项不位于延音目标')
  })

  it('rejects + lyrics that skip ordinary notes to a later tie target', () => {
    const source = '{4/4} 1 2 3~ 3 |||\n{lyrics}a +b c d{/}'

    expect(messages(source)).toContain('[L] 第 2 行：第 1 遍的 +歌词项不位于延音目标')
  })

  it('counts character lyrics, grouped lyrics, extenders, and repeated placeholders by alignment position', () => {
    expect(messages('{5/4} 1 2 3 4 5 |||\n{lyrics}甲，{%2}(乙丙)_{0}{/}')).toBe('')
  })

  it('rejects the legacy counted-placeholder syntax', () => {
    expect(messages('{5/4} 1 2 3 4 5 |||\n{lyrics}%{2}甲乙丙{/}')).toContain('重复占位必须写作 {%N}')
  })

  it('validates bass uniqueness, allowed content, and timeline alignment', () => {
    const source = [
      '{3/4} 1 2 3 |||',
      '{bass} {key=G} 1d^ 1d ||| {/bass}',
      '{bass} 1d 2d 3d ||| {/}',
    ].join('\n')
    const result = messages(source)
    expect(result).toContain('最多包含一个低音谱表块')
    expect(result).toContain('低音谱表内不能声明调号')
  })

  it('shares melody key changes with bass tie validation', () => {
    const source = '{key=C} {2/4} 1 2 | {key=G}1 2 |||\n{bass}1d 1d~ | 1d 2d |||{/}'
    expect(messages(source)).toContain('延音目标的类型或绝对音高不匹配')
  })

  it('rejects supplementary blocks before an incomplete body or nested blocks', () => {
    const result = messages('1 2\n{lyrics}{bass}x{/}{/}')
    expect(result).toContain('补充块不能嵌套')
    expect(result).toContain('补充块只能写在完整乐谱正文之后')
  })
})

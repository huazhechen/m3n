import { describe, expect, it } from 'vitest'
import { invalidMeasureBarEnds, invalidMeasureIds, validateM3N, validateM3NDiagnostics } from './m3n-validate'
import { parseM3NDocument } from './m3n-direct'

const messages = (source: string) => validateM3N(source).join('\n')

describe('validateM3N', () => {

  it('validates bar-aligned v0.3 lyrics measure by measure', () => {
    expect(validateM3N('{2/4}\nN: 1 2 | 3 4 |||\nL: 甲乙 | 丙丁')).toEqual([])

    const misaligned = messages('{2/4}\nN: 1 2 | 3 4 |||\nL: 甲 | 丙丁戊')
    expect(misaligned).toContain('歌词第 1 小节对位数量不匹配：乐句第 1 遍需要 2 项，实际 1 项')
    expect(misaligned).toContain('歌词第 2 小节对位数量不匹配：乐句第 1 遍需要 2 项，实际 3 项')
    expect(messages('{2/4}\nN: 1 2 | 3 4 |||\nL: 甲乙 | 丙丁 | 戊己')).toContain('乐句第 1 遍需要 2 个歌词小节，实际 3 个')
  })

  it('closes a house before its ordinary trailing barline', () => {
    expect(validateM3N('{2/4}\nN: 1 2 |\n---V1\nN: 3 4 |\n---V2\nN: 5 6 |||')).toEqual([])
  })

  it('requires every measure in a phrase to have the same playback count', () => {
    const source = '{2/4}\nN: 1 2 |\n---\nN: 1 2 ||: 3 4 :|||'

    expect(messages(source)).toContain('第 4 行，第 3 小节：同一乐句内的小节演奏次数必须一致')
  })

  it('rejects ties and slurs across alternate-ending boundaries', () => {
    const tie = '{2/4}\nN: ||: 1 4~ |\n---V1\nN: 4 5 :||\n---V2\nN: 4 3 |||'
    const slur = '{2/4}\nN: {lg}1 2 |\n---V1\nN: 3 4{/} :||\n---V2\nN: 5 6 |||'
    const ordinaryBoundary = '{2/4}\nN: 1 4~ |\n---\nN: 4 {lg}5 6 |\n---\nN: 1 2{/} |||'

    expect(messages(tie)).toContain('延音不能跨越跳房子边界')
    expect(messages(slur)).toContain('连音不能跨越跳房子边界')
    expect(messages(ordinaryBoundary)).not.toContain('不能跨越跳房子边界')
  })

  it('rejects ties and slurs leaving the final alternate ending', () => {
    const tie = '{2/4}\nN: ||: 1 2 |\n---V1\nN: 3 4 :||\n---V2\nN: 5 6~ |\n---\nN: 6 5 |||'
    const slur = '{2/4}\nN: ||: 1 2 |\n---V1\nN: 3 4 :||\n---V2\nN: {lg}5 6 |\n---\nN: 5 6{/} |||'

    expect(messages(tie)).toContain('延音不能跨越跳房子边界')
    expect(messages(slur)).toContain('连音不能跨越跳房子边界')
  })

  it('validates harmony syntax, measure alignment, duration, and ties', () => {
    expect(validateM3N('{2/4}\nN: 1 2 | 3 4 |||\nC: I | (V) (V) |')).toEqual([])
    expect(messages('{2/4}\nN: 1 2 |||\nC: garbage |')).toContain('和弦符号非法：garbage')
    expect(messages('{2/4}\nN: 1 2 | 3 4 |||\nC: I |')).toContain('和弦行小节数量不匹配')
    expect(messages('{2/4}\nN: 1 2 |||\nC: I V |')).toContain('和弦第 1 小节时值不匹配')
    expect(messages('{2/4}\nN: 1 2 |||\nC: I~ V |')).toContain('和弦延续线两端必须是相同和弦')
  })

  it('does not let a later house group increase an earlier phrase lyric count', () => {
    const source = [
      '{2/4}',
      'N: ||: 1 2 |',
      'L1: 甲乙',
      'L2: 甲乙',
      '---V1',
      'N: 3 4 |',
      '---V2',
      'N: 5 6 |',
      '---',
      'N: 7 1 |',
      'L1: 甲乙',
      'L2: 甲乙',
      '---V1',
      'N: 2 3 :||',
      '---V2',
      'N: 4 5 ||',
      '---V3',
      'N: 6 7 |||',
    ].join('\n')

    expect(messages(source)).not.toContain('第 2 行：乐句缺少 L3: 歌词行')
    expect(messages(source)).not.toContain('第 10 行：乐句缺少 L3: 歌词行')
  })

  it('uses declared house passes for numbered lyric rows', () => {
    const source = [
      '{2/4}',
      'N: ||: 1 2 |',
      'L1: 甲乙',
      'L2: 丙丁',
      'L3: 戊己',
      'L4: 庚辛',
      '---V1',
      'N: 3 4 :||',
      'L: 壬癸',
      '---V2,V3,V4',
      'N: 5 6 :||{x4} |||',
      'L2: 子丑',
      'L3: 寅卯',
      'L4: 辰巳',
    ].join('\n')

    expect(messages(source)).toBe('')
  })

  it('maps projected diagnostics back to the original phrase line', () => {
    const result = messages('{2/4}\nN: 1 2 |\n---V1\nN: 3{arp} 4 |||')

    expect(result).toContain('第 4 行：琶音只能附在和音组之后')
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

  it('validates exact key, meter, tempo, and chord formats', () => {
    const result = messages([
      '{key=Cmaj} {3/3} {120QPM} {chord=VIII} {transpose=1.5}',
      '1 2 3 4 |||',
    ].join('\n'))
    expect(result).toContain('调号格式非法')
    expect(result).toContain('拍号格式非法')
    expect(result).toContain('qpm 必须使用小写')
    expect(result).toContain('和弦标记值非法')
    expect(result).toContain('transpose 必须是整数')
  })

  it('reports unsupported directives as unknown instructions', () => {
    expect(messages('{2/4}\nN: {volta=1}1 2{/} |||')).toContain('未知指令：{volta=1}')
    expect(messages('{2/4}\nN: {ending=1}1 2{/} |||')).toContain('未知指令：{ending=1}')
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

  it('requires a unique terminal but allows later navigation', () => {
    expect(messages('{4/4}\n1 2 3 4 |')).toContain('必须且只能使用一次终止线')
    expect(validateM3N('{4/4}\n{segno}1 2 3 4 ||| {ds}')).toEqual([])
    expect(validateM3N('{4/4}\n1 2 3 4 ||| 1 2 3 4 |')).toEqual([])
  })

  it('enforces multi-measure-rest isolation', () => {
    const result = messages('{4/4}\n1 {rest=2} | ({rest=1}) | 1 2 3 4 |||')
    expect(result).toContain('多小节休止必须独占一个小节位置')
    expect(result).toContain('多小节休止不能使用圆括号修饰')
  })
})

import { splitSupplementBlocks, parseM3NNote, durationInBeats } from './m3n-abc'

// --- Attribute validation helpers ---

const VALID_INFO_FIELDS = new Set([
  'title', 'subtitle', 'composer', 'lyricist',
  'arranger', 'copyright', 'source', 'note', 'transpose',
])

const VALID_FLAG_ATTRIBUTES = new Set([
  'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz',
  'cresc', 'decres', 'lg',
  'tr', 'echo', 'str', 'brk', 'tip', 'hold', 'breath',
  'wav', 'wav+', 'wav-',
  'f1', 'f2', 'f3', 'f4', 'f5',
  '8va', '8vb',
  'part', 'parts', 'br',
])

function isValidAttribute(content: string): boolean {
  const eqIdx = content.indexOf('=')
  if (eqIdx !== -1) {
    const name = content.slice(0, eqIdx)
    return VALID_INFO_FIELDS.has(name) || name === 'key' || name === 'chord' || name === 'rest' || name === 'text' || name === 'volta' || name === 'part'
  }
  if (/^(ac|ap)\(/.test(content)) return true
  if (/^\d+\/\d+$/.test(content)) return true
  if (/^\d+qpm$/i.test(content)) return true
  if (content === '/') return true
  return VALID_FLAG_ATTRIBUTES.has(content)
}

function validateKeyFormat(value: string): string | null {
  const match = /^([A-G](?:#|b)?)([A-Za-z]*)$/.exec(value.trim())
  if (!match) return '调号格式非法'
  const mode = match[2]
  if (mode && !['maj', 'min', 'dor', 'phr', 'lyd', 'mix', 'loc', 'm'].includes(mode)) {
    return `调式后缀非法：${mode}`
  }
  return null
}

function validateVolta(value: string): string | null {
  const parts = value.split(',')
  for (const part of parts) {
    const rangeMatch = /^(\d+)~(\d+)$/.exec(part)
    if (rangeMatch) {
      const start = Number(rangeMatch[1])
      const end = Number(rangeMatch[2])
      if (start <= 0 || end <= 0) return 'volta 值须为正整数'
      if (start > end) return 'volta 范围起始不得大于结束'
    } else {
      const num = Number(part)
      if (!Number.isFinite(num) || num <= 0 || !/^\d+$/.test(part)) return 'volta 值须为正整数'
    }
  }
  return null
}

function validateChordName(value: string): string | null {
  if (!value) return '和弦级数为空'
  if (!/^(I{1,3}|IV|VI{0,2}|i{1,3}|iv|vi{0,2})[a-zA-Z0-9°+#]*$/.test(value)) {
    return '和弦级数无法解析'
  }
  return null
}

// --- Body validator ---

function validateBody(source: string): string[] {
  const diagnostics: string[] = []

  let index = 0
  let line = 1
  let parenDepth = 0
  let parenDepthInMeasure = 0
  let groupDepthInMeasure = 0
  let currentMeasureBeats = 0
  const measureBeatCounts: number[] = []
  const intervalAttrs: string[] = []
  const seenInfoFields = new Set<string>()
  let hasTerminalBarline = false
  let lastTiePitch: string | null = null
  let lastWasRest = false
  let currentMeter = { beats: 4, beatValue: 4 }
  const forwardRepeats: number[] = [] // line numbers of unmatched ||:

  while (index < source.length) {
    const rest = source.slice(index)

    // Whitespace
    const whitespace = /^\s+/.exec(rest)
    if (whitespace) {
      line += whitespace[0].split('\n').length - 1
      index += whitespace[0].length
      continue
    }

    // Comment
    if (rest.startsWith('//')) {
      const end = rest.indexOf('\n')
      index += end === -1 ? rest.length : end
      continue
    }

    // Bar line
    const bar = /^(?::\|\|\||:\|\|:|:\|\||\|\|\||\|\|:|\|\||\|)/.exec(rest)
    if (bar) {
      // P1: unclosed parentheses in measure
      if (parenDepthInMeasure > 0) {
        diagnostics.push(`第 ${line} 行：括号未在小节内闭合`)
      }
      // P1: unclosed group in measure
      if (groupDepthInMeasure > 0) {
        diagnostics.push(`第 ${line} 行：分组未在小节内闭合`)
      }
      // Save current measure beats
      measureBeatCounts.push(currentMeasureBeats)
      currentMeasureBeats = 0
      // Track terminal barline
      if (bar[0] === '|||' || bar[0] === ':|||') {
        hasTerminalBarline = true
      }
      // P4: Track repeat barlines
      if (bar[0] === '||:' || bar[0] === ':||:') {
        forwardRepeats.push(line)
      }
      if (bar[0] === ':||' || bar[0] === ':|||' || bar[0] === ':||:') {
        if (forwardRepeats.length > 0) {
          forwardRepeats.pop()
        }
      }
      parenDepthInMeasure = 0
      groupDepthInMeasure = 0
      index += bar[0].length
      continue
    }

    // Open paren
    if (rest.startsWith('(')) {
      parenDepth++
      parenDepthInMeasure++
      index += 1
      continue
    }

    // Close paren
    if (rest.startsWith(')')) {
      if (parenDepthInMeasure === 0) {
        diagnostics.push(`第 ${line} 行：多余的右括号`)
      } else {
        parenDepthInMeasure--
      }
      parenDepth = Math.max(0, parenDepth - 1)
      index += 1
      continue
    }

    // Attribute
    const attribute = /^\{[^}]+\}/.exec(rest)
    if (attribute) {
      const content = attribute[0].slice(1, -1).trim()

      // V1: Unknown attribute
      if (!isValidAttribute(content)) {
        diagnostics.push(`第 ${line} 行：未知属性：{${content}}`)
      }

      // R1: Duplicate info fields
      const eqIdx = content.indexOf('=')
      if (eqIdx !== -1) {
        const fieldName = content.slice(0, eqIdx)
        if (VALID_INFO_FIELDS.has(fieldName)) {
          if (seenInfoFields.has(fieldName)) {
            diagnostics.push(`第 ${line} 行：重复声明字段：${fieldName}`)
          }
          seenInfoFields.add(fieldName)
        }
      }

      // V2: Key format
      if (content.startsWith('key=')) {
        const keyError = validateKeyFormat(content.slice('key='.length))
        if (keyError) diagnostics.push(`第 ${line} 行：${keyError}`)
      }

      // V3: Time signature format
      if (/^\d+\/\d+$/.test(content)) {
        const [beats, beatValue] = content.split('/').map(Number)
        if (beats <= 0 || beatValue <= 0) {
          diagnostics.push(`第 ${line} 行：拍号格式非法：${content}`)
        }
        currentMeter = { beats, beatValue }
      }

      // V3: Tempo format
      if (/^\d+qpm$/i.test(content)) {
        const qpm = Number(content.replace(/qpm$/i, ''))
        if (qpm <= 0) {
          diagnostics.push(`第 ${line} 行：速度格式非法：${content}`)
        }
      }

      // V6: Volta format
      if (content.startsWith('volta=')) {
        const voltaError = validateVolta(content.slice('volta='.length))
        if (voltaError) diagnostics.push(`第 ${line} 行：${voltaError}`)
      }

      // V5: Chord name format
      if (content.startsWith('chord=')) {
        const chordError = validateChordName(content.slice('chord='.length))
        if (chordError) diagnostics.push(`第 ${line} 行：${chordError}`)
      }

      // V3: Rest value
      if (content.startsWith('rest=')) {
        const restVal = Number(content.slice('rest='.length))
        if (!Number.isFinite(restVal) || restVal <= 0 || !/^\d+$/.test(content.slice('rest='.length))) {
          diagnostics.push(`第 ${line} 行：多小节休止值非法：${content}`)
        } else {
          currentMeasureBeats += restVal * currentMeter.beats
        }
      }

      // M3: Rest with articulation
      if (lastWasRest) {
        const articulationAttrs = new Set(['tr', 'echo', 'str', 'brk', 'tip', 'hold', 'breath', 'wav', 'wav+', 'wav-'])
        if (articulationAttrs.has(content)) {
          diagnostics.push(`第 ${line} 行：休止符不可使用奏法标记`)
        }
      }

      // P2/P3: Interval attribute tracking
      if (content === 'cresc' || content === 'decres' || content === '8va' || content === '8vb' || content === 'lg') {
        intervalAttrs.push(content)
      } else if (content.startsWith('/') && content.length > 1) {
        const closingName = content.slice(1)
        const idx = intervalAttrs.lastIndexOf(closingName)
        if (idx === -1) {
          diagnostics.push(`第 ${line} 行：闭合标签无对应开始：{/${closingName}}`)
        } else {
          intervalAttrs.splice(idx, 1)
        }
      }

      // R5/R6: Ornament validation
      const ornamentMatch = /^(ac|ap)\(([^)]*)\)$/.exec(content)
      if (ornamentMatch) {
        const prefix = ornamentMatch[1]
        const inner = ornamentMatch[2].trim()
        // R6: Empty ornament
        if (!inner) {
          diagnostics.push(`第 ${line} 行：装饰音内至少需要一个音高`)
        } else {
          const tokens = inner.split(/\s+/).filter(Boolean)
          for (const token of tokens) {
            const parsed = parseM3NNote(token)
            if (!parsed) {
              diagnostics.push(`第 ${line} 行：装饰音内含非法元素：${token}`)
            } else if (parsed.degreeRaw === '0') {
              diagnostics.push(`第 ${line} 行：装饰音内不允许休止符`)
            } else if (parsed.carets.length > 0 || parsed.dots.length > 0 || parsed.tie) {
              diagnostics.push(`第 ${line} 行：装饰音内含时值修饰：${token}`)
            }
          }
        }
      }

      lastWasRest = false
      index += attribute[0].length
      continue
    }

    // Group — check for unclosed [ before trying regex
    if (rest.startsWith('[')) {
      const group = /^\[([^\]:]+):([^\]]+)\](\^*)(\.*)(~?)/.exec(rest)
      if (!group) {
        // P1: unclosed group
        groupDepthInMeasure++
        index += 1
        continue
      }
    }
    const group = /^\[([^\]:]+):([^\]]+)\](\^*)(\.*)(~?)/.exec(rest)
    if (group) {
      const notes = group[1].trim().split(/\s+/).filter(Boolean)
      const mode = group[2].trim()

      // R4: Insufficient notes in group (at least 2)
      if (notes.length < 2) {
        diagnostics.push(`第 ${line} 行：分组音数不足，至少需要两个音高`)
      }

      // R3: Illegal elements in group
      for (const note of notes) {
        const parsed = parseM3NNote(note)
        if (!parsed) {
          diagnostics.push(`第 ${line} 行：分组内含非法元素：${note}`)
        } else if (parsed.degreeRaw === '0') {
          diagnostics.push(`第 ${line} 行：分组内不允许休止符`)
        } else if (parsed.carets.length > 0 || parsed.dots.length > 0 || parsed.tie) {
          diagnostics.push(`第 ${line} 行：分组内不允许时值修饰符`)
        }
      }

      // V4: Tuplet ratio
      if (mode !== 'h') {
        const totalUnits = Number(mode)
        if (!Number.isFinite(totalUnits) || totalUnits <= 0) {
          diagnostics.push(`第 ${line} 行：连音组比值非法：${mode}`)
        }
      }

      // Beat contribution
      if (mode === 'h') {
        const first = parseM3NNote(notes[0] ?? '')
        if (first) {
          currentMeasureBeats += durationInBeats(parenDepth, first.carets.length + group[3].length, first.dots.length + group[4].length)
        }
      } else {
        const totalUnits = Number(mode)
        if (Number.isFinite(totalUnits) && totalUnits > 0) {
          currentMeasureBeats += totalUnits * durationInBeats(parenDepth, group[3].length, group[4].length)
        }
      }

      // Handle tie on group
      if (group[5] === '~') {
        lastTiePitch = null // Group ties can't be validated for pitch match
      } else {
        lastTiePitch = null
      }

      lastWasRest = false
      index += group[0].length
      continue
    }

    // Note
    const note = /^(?:0|[1-7][#b=]*[ed]*)(?:\^+)?(?:\.*)?~?/.exec(rest)
    if (note) {
      const parsed = parseM3NNote(note[0])
      if (parsed) {
        // M3: Rest with tie
        if (parsed.degreeRaw === '0') {
          if (parsed.tie) {
            diagnostics.push(`第 ${line} 行：休止符不可使用延音`)
          }
          lastTiePitch = null
          lastWasRest = true
        } else {
          // M2: Tie target mismatch
          const pitchKey = `${parsed.degreeRaw}|${parsed.accidentals}|${parsed.octave}`
          if (lastTiePitch !== null && pitchKey !== lastTiePitch) {
            diagnostics.push(`第 ${line} 行：延音目标音高不匹配`)
          }
          lastTiePitch = parsed.tie ? pitchKey : null
          lastWasRest = false
        }

        // Beat contribution
        currentMeasureBeats += durationInBeats(parenDepth, parsed.carets.length, parsed.dots.length)
      }
      index += note[0].length
      continue
    }

    // Unknown token
    const unknown = /^\S+/.exec(rest)?.[0] ?? rest[0]
    diagnostics.push(`第 ${line} 行：无法识别的语法：${unknown}`)
    index += unknown.length
  }

  // P2: Unclosed interval attributes
  for (const attr of intervalAttrs) {
    diagnostics.push(`未闭合的区间属性：{${attr}}`)
  }

  // P1: Unclosed parens at end
  if (parenDepthInMeasure > 0) {
    diagnostics.push('括号未在小节内闭合')
  }

  // P1: Unclosed group at end
  if (groupDepthInMeasure > 0) {
    diagnostics.push('分组未在小节内闭合')
  }

  // P4: Unclosed forward repeats
  for (const repeatLine of forwardRepeats) {
    diagnostics.push(`第 ${repeatLine} 行：前反复线无对应后反复线`)
  }

  // Remaining beats (piece ended without terminal barline)
  if (currentMeasureBeats > 0) {
    measureBeatCounts.push(currentMeasureBeats)
  }

  // S1: Missing terminal barline
  if (!hasTerminalBarline && measureBeatCounts.length > 0) {
    diagnostics.push('乐谱正文缺少终止线')
  }

  // M1: Measure beat validation
  const meterBeats = currentMeter.beats
  if (measureBeatCounts.length === 1) {
    if (measureBeatCounts[0] !== meterBeats) {
      diagnostics.push(`小节拍数不合规：期望 ${meterBeats} 拍，实际 ${measureBeatCounts[0]} 拍`)
    }
  } else if (measureBeatCounts.length >= 2) {
    for (let i = 1; i < measureBeatCounts.length - 1; i++) {
      if (measureBeatCounts[i] !== meterBeats) {
        diagnostics.push(`中间小节拍数不足：期望 ${meterBeats} 拍，实际 ${measureBeatCounts[i]} 拍`)
      }
    }
    const first = measureBeatCounts[0]
    const last = measureBeatCounts[measureBeatCounts.length - 1]
    if (last !== meterBeats && first + last !== meterBeats) {
      diagnostics.push(`首末小节拍数之和不为 ${meterBeats} 拍：首 ${first} 拍 + 末 ${last} 拍 = ${first + last} 拍`)
    }
  }

  return diagnostics
}

// --- Public API ---

export function validateM3N(source: string): string[] {
  const diagnostics: string[] = []
  const { main, bass, lyrics } = splitSupplementBlocks(source)

  // S2: Supplementary sections before main body
  // Check if {lyrics} or {bass} appears before any terminal barline in raw source
  const strippedSource = source.replace(/\/\/.*$/gm, '') // remove comments
  const terminalPos = Math.max(
    strippedSource.lastIndexOf('|||'),
    strippedSource.lastIndexOf(':|||')
  )
  if (terminalPos >= 0) {
    const beforeTerminal = strippedSource.slice(0, terminalPos)
    if (/\{lyrics/.test(beforeTerminal)) {
      diagnostics.push('补充片段出现在正文之前：歌词块须在终止线之后')
    }
    if (/\{bass\}/.test(beforeTerminal)) {
      diagnostics.push('补充片段出现在正文之前：低音谱表须在终止线之后')
    }
  } else if (/\{lyrics/.test(strippedSource) || /\{bass\}/.test(strippedSource)) {
    // No terminal barline but has supplements — supplement is before the (missing) body
    if (/\{lyrics/.test(strippedSource)) {
      diagnostics.push('补充片段出现在正文之前：歌词块须在终止线之后')
    }
    if (/\{bass\}/.test(strippedSource)) {
      diagnostics.push('补充片段出现在正文之前：低音谱表须在终止线之后')
    }
  }

  // S3: Empty lyrics
  for (const lyric of lyrics) {
    if (!lyric.text.trim()) {
      diagnostics.push('歌词块为空')
    }
  }

  // S3: Empty bass
  const hasBassBlock = /\{bass\}/.test(source)
  if (hasBassBlock && !bass) {
    diagnostics.push('低音谱表内容为空')
  }

  // S4: Part reference consistency
  const definedParts = new Set<string>()
  const referencedParts: string[] = []
  const partAttrMatch = source.match(/\{parts=([^}]+)\}/g)
  if (partAttrMatch) {
    for (const m of partAttrMatch) {
      const names = m.slice(7, -1).trim().split(/\s+/).filter(Boolean)
      referencedParts.push(...names)
    }
  }
  const partDefMatch = source.match(/\{part=([A-Za-z0-9]+)\}/g)
  if (partDefMatch) {
    for (const m of partDefMatch) {
      definedParts.add(m.slice(6, -1).trim())
    }
  }
  const unreferenced = [...definedParts].filter(p => !referencedParts.includes(p))
  if (unreferenced.length > 0) {
    diagnostics.push(`段落声明未被引用：${unreferenced.join(', ')}`)
  }
  const undefined_ = referencedParts.filter(p => !definedParts.has(p))
  if (undefined_.length > 0) {
    diagnostics.push(`段落引用未定义：${undefined_.join(', ')}`)
  }

  // Validate main body
  diagnostics.push(...validateBody(main))

  // S1: Bass missing terminal barline
  if (bass && !/\|\|\|/.test(bass)) {
    diagnostics.push('低音谱表缺少终止线')
  }

  // Validate bass body
  if (bass) {
    diagnostics.push(...validateBody(bass))
  }

  return diagnostics
}

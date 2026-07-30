export type PlaybackSource = {
  abc: string
  toOriginalPosition: (position: number) => number
}

export function scoreFileName(abc: string) {
  const title = abc.match(/^T:(.+)$/m)?.[1]?.trim() || 'm3n-score'
  return title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'm3n-score'
}

export function withoutBassStaff(abc: string) {
  let isBassVoice = false
  return abc
    .split('\n')
    .filter((line) => {
      if (/^%%score\b/.test(line)) {
        return false
      }
      if (/^V:bass\b/.test(line)) {
        isBassVoice = true
        return false
      }
      return !isBassVoice
    })
    .join('\n')
}

export function createPlaybackSource(abc: string): PlaybackSource {
  const lines = abc.match(/.*(?:\r?\n|$)/g)?.filter(Boolean) ?? []
  const header: string[] = []
  const segments = new Map<string, Array<{ value: string; originalStart: number }>>()
  let hasKey = false
  let partOrder: string[] | null = null
  let activePart: string | null = null
  let offset = 0

  for (const line of lines) {
    const content = line.replace(/\r?\n$/, '')
    if (!hasKey) {
      if (!partOrder && /^P:/.test(content)) {
        partOrder = content.slice(2).trim().split(/\s+/).filter(Boolean)
      } else {
        header.push(line)
      }
      hasKey = /^K:/.test(content)
      offset += line.length
      continue
    }

    if (!partOrder && /^P:/.test(content) && /\s/.test(content.slice(2).trim())) {
      partOrder = content.slice(2).trim().split(/\s+/).filter(Boolean)
      offset += line.length
      continue
    }

    if (/^P:/.test(content)) {
      activePart = content.slice(2).trim()
      if (!segments.has(activePart)) {
        segments.set(activePart, [])
      }
      offset += line.length
      continue
    }

    if (activePart) {
      segments.get(activePart)?.push({ value: line, originalStart: offset })
    } else {
      header.push(line)
    }
    offset += line.length
  }

  if (!partOrder || partOrder.length === 0 || partOrder.some((part) => !segments.has(part))) {
    return { abc, toOriginalPosition: (position) => position }
  }

  const mappings: Array<{ playbackStart: number; playbackEnd: number; originalStart: number }> = []
  let expanded = header.join('')
  for (const part of partOrder) {
    if (expanded.length > 0 && !expanded.endsWith('\n')) {
      expanded += '\n'
    }
    expanded += `P:${part}\n`
    for (const chunk of segments.get(part) ?? []) {
      const playbackStart = expanded.length
      expanded += chunk.value
      mappings.push({
        playbackStart,
        playbackEnd: expanded.length,
        originalStart: chunk.originalStart,
      })
    }
  }

  return {
    abc: expanded,
    toOriginalPosition(position) {
      const mapping = mappings.find(
        (item) => position >= item.playbackStart && position <= item.playbackEnd,
      )
      return mapping ? mapping.originalStart + position - mapping.playbackStart : position
    },
  }
}

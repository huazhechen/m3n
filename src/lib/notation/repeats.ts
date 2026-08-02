export type PlaybackNavigation = 'segno' | 'ds' | 'dc' | 'fine'

export type PlaybackNode = {
  id: string
  kind: 'section' | 'ending'
  n?: string
  repeatStart?: boolean
  repeatCount?: number
  navigation?: readonly PlaybackNavigation[]
}

export type PlaybackMeasure = {
  events: ReadonlyArray<{ navigation: readonly PlaybackNavigation[] }>
  left?: string
  right?: string
  ending?: string
  repeatCount?: number
}

export function parsePassRange(value: string) {
  const passes = new Set<number>()
  for (const token of value.split(',')) {
    const range = /^(\d+)~(\d+)$/.exec(token.trim())
    if (range) {
      for (let pass = Number(range[1]); pass <= Number(range[2]); pass += 1) passes.add(pass)
      continue
    }
    const pass = Number(token.trim())
    if (Number.isInteger(pass) && pass > 0) passes.add(pass)
  }
  return passes
}

/** Returns the playback passes in which each written measure occurs. */
export function measurePlaybackPasses<T extends PlaybackMeasure>(measures: readonly T[]) {
  const passesByMeasure = new Map<T, Set<number>>(measures.map((measure) => [measure, new Set([1])]))
  let repeatStart = 0

  for (const [index, measure] of measures.entries()) {
    if (measure.left === 'rptstart') repeatStart = index
    if (measure.right !== 'rptend') continue

    let passCount = measure.repeatCount ?? 2
    for (let endingIndex = repeatStart; endingIndex <= index; endingIndex += 1) {
      const ending = measures[endingIndex]?.ending
      if (ending) for (const pass of parsePassRange(ending)) passCount = Math.max(passCount, pass)
    }
    for (let endingIndex = index + 1; measures[endingIndex]?.ending; endingIndex += 1) {
      for (const pass of parsePassRange(measures[endingIndex]!.ending!)) passCount = Math.max(passCount, pass)
    }
    for (let repeatedIndex = repeatStart; repeatedIndex <= index; repeatedIndex += 1) {
      passesByMeasure.set(measures[repeatedIndex]!, new Set(Array.from({ length: passCount }, (_, pass) => pass + 1)))
    }
  }

  for (const measure of measures) {
    if (measure.ending) passesByMeasure.set(measure, parsePassRange(measure.ending))
  }

  const segnoIndex = measures.findIndex((measure) => measure.events.some((event) => event.navigation.includes('segno')))
  const jumpIndex = measures.findIndex((measure) => measure.events.some((event) => event.navigation.includes('ds') || event.navigation.includes('dc')))
  if (segnoIndex >= 0 && jumpIndex >= segnoIndex) {
    let endingStart = jumpIndex
    while (endingStart > 0 && measures[endingStart - 1]?.ending) endingStart -= 1
    let endingEnd = jumpIndex + 1
    while (measures[endingEnd]?.ending) endingEnd += 1
    const currentEndingPass = Math.max(0, ...measures.slice(endingStart, endingEnd).flatMap((measure) => (
      measure.ending ? [...parsePassRange(measure.ending)] : []
    )))
    const returnPass = Math.min(...measures.slice(endingEnd).flatMap((measure) => (
      measure.ending ? [...parsePassRange(measure.ending)].filter((pass) => pass > currentEndingPass) : []
    )))
    if (Number.isFinite(returnPass)) {
      for (const passes of passesByMeasure.values()) passes.delete(returnPass)
      const returnEndingIndex = measures.findIndex((measure, index) => (
        index >= endingEnd && measure.ending !== undefined && parsePassRange(measure.ending).has(returnPass)
      ))
      for (let index = segnoIndex; index <= returnEndingIndex; index += 1) {
        const measure = measures[index]!
        if (!measure.ending || parsePassRange(measure.ending).has(returnPass)) {
          passesByMeasure.get(measure)?.add(returnPass)
        }
      }
    } else if (measures[jumpIndex]?.events.some((event) => event.navigation.includes('ds'))) {
      // Without a later ending to name the return pass, D.S. supplies the
      // second lyric path from the segno through the jump.
      for (let index = segnoIndex; index <= jumpIndex; index += 1) {
        passesByMeasure.get(measures[index]!)?.add(2)
      }
    }
  }
  return passesByMeasure
}

function chooseEnding(nodes: readonly PlaybackNode[], start: number, end: number, pass: number) {
  for (let index = start; index <= end; index += 1) {
    if (parsePassRange(nodes[index]?.n ?? '').has(pass)) return index
  }
  return undefined
}

function expandInitialPasses(nodes: readonly PlaybackNode[]) {
  const sequence: string[] = []
  const endingGroups = new Map<number, { end: number; repeatStart: number; hasExplicitRepeatStart: boolean; passCount: number }>()
  const hasRepeatEnd = nodes.some((node) => node.repeatCount)
  let latestRepeatStart = 0
  let hasExplicitRepeatStart = false
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node?.kind === 'section' && node.repeatStart) {
      latestRepeatStart = index
      hasExplicitRepeatStart = true
    }
    if (node?.kind !== 'ending') continue

    const start = index
    while (nodes[index + 1]?.kind === 'ending') index += 1
    const endings = nodes.slice(start, index + 1)
    if (!hasRepeatEnd) continue
    const passCount = Math.max(1, ...endings.flatMap((ending) => [...parsePassRange(ending.n ?? '')]), ...endings.map((ending) => ending.repeatCount ?? 0))
    for (let endingIndex = start; endingIndex <= index; endingIndex += 1) {
      endingGroups.set(endingIndex, { end: index, repeatStart: latestRepeatStart, hasExplicitRepeatStart, passCount })
    }
  }

  const repeatVisits = new Map<number, number>()
  const ordinaryRepeatEnds = new Set(nodes.flatMap((node, index) => node.kind === 'section' && node.repeatCount ? [index] : []))
  const repeatStarts = new Map<number, number>()
  let implicitRepeatStart = 0
  let explicitRepeatStart: number | undefined
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!
    if (node.kind === 'section' && node.repeatStart) explicitRepeatStart = index
    if (node.kind !== 'section' || !node.repeatCount) continue
    repeatStarts.set(index, explicitRepeatStart ?? implicitRepeatStart)
    // Explicit start/end pairs are self-contained. Consecutive bare repeat
    // ends, however, keep the same implicit beginning (normally the score).
    if (explicitRepeatStart !== undefined) implicitRepeatStart = index + 1
    explicitRepeatStart = undefined
  }
  let index = 0
  while (index < nodes.length) {
    const node = nodes[index]!
    const endingGroup = endingGroups.get(index)
    if (endingGroup) {
      const visit = (repeatVisits.get(index) ?? 0) + 1
      repeatVisits.set(index, visit)
      const selectedIndex = chooseEnding(nodes, index, endingGroup.end, Math.min(visit, endingGroup.passCount))
      if (selectedIndex !== undefined) sequence.push(nodes[selectedIndex]!.id)

      const selected = selectedIndex === undefined ? undefined : nodes[selectedIndex]
      if (selected?.repeatCount && visit < selected.repeatCount) {
        if (!endingGroup.hasExplicitRepeatStart) {
          for (const endingIndex of endingGroups.keys()) {
            if (endingIndex < index) repeatVisits.delete(endingIndex)
          }
        }
        index = endingGroup.repeatStart
      } else {
        index = endingGroup.end + 1
      }
      continue
    }

    sequence.push(node.id)
    if (node.repeatCount) {
      const visit = (repeatVisits.get(index) ?? 0) + 1
      repeatVisits.set(index, visit)
      if (visit < node.repeatCount) {
        for (const repeatEnd of ordinaryRepeatEnds) {
          if (repeatEnd < index) repeatVisits.delete(repeatEnd)
        }
        index = repeatStarts.get(index) ?? 0
        continue
      }
    }
    index += 1
  }
  return sequence
}

function appendJumpReturn(nodes: readonly PlaybackNode[], initial: string[]) {
  const jumpIndex = nodes.findIndex((node) => node.navigation?.some((value) => value === 'ds' || value === 'dc'))
  if (jumpIndex < 0) return initial

  const jump = nodes[jumpIndex]!
  const destinationIndex = jump.navigation?.includes('ds')
    ? nodes.findIndex((node) => node.navigation?.includes('segno'))
    : nodes.findIndex((node) => node.kind === 'section')
  const fineIndex = nodes.findIndex((node) => node.navigation?.includes('fine'))
  if (destinationIndex < 0) return initial

  const playedJumpIndex = initial.lastIndexOf(jump.id)
  if (playedJumpIndex < 0) return initial

  let returnEndIndex = fineIndex >= 0 ? fineIndex : jumpIndex
  let returnPass: number | undefined
  let skipEndings = false
  if (fineIndex < 0) {
    let endingEnd = jumpIndex + 1
    while (nodes[endingEnd]?.kind === 'ending') endingEnd += 1
    const jumpPass = Math.max(0, ...parsePassRange(jump.n ?? ''))
    const nextEndingIndex = nodes.findIndex((node, index) => (
      index > jumpIndex
      && index < endingEnd
      && node.kind === 'ending'
      && [...parsePassRange(node.n ?? '')].some((pass) => pass > jumpPass)
    ))
    if (nextEndingIndex >= 0) {
      returnPass = Math.min(...[...parsePassRange(nodes[nextEndingIndex]!.n ?? '')].filter((pass) => pass > jumpPass))
      returnEndIndex = nextEndingIndex
    } else {
      skipEndings = true
      returnEndIndex = Math.min(endingEnd, nodes.length - 1)
    }
  }

  const returnPath = nodes.slice(destinationIndex, returnEndIndex + 1).flatMap((node) => {
    if (node.kind !== 'ending') return node.id
    if (skipEndings) return returnPass !== undefined && parsePassRange(node.n ?? '').has(returnPass) ? node.id : []
    return !returnPass || parsePassRange(node.n ?? '').has(returnPass) ? node.id : []
  })
  return [...initial.slice(0, playedJumpIndex + 1), ...returnPath]
}

/** Returns written node ids in performance order, including one D.S./D.C. return. */
export function buildPlaybackSequence(nodes: readonly PlaybackNode[]) {
  return appendJumpReturn(nodes, expandInitialPasses(nodes))
}

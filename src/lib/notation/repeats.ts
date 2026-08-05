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
  navigation?: readonly PlaybackNavigation[]
  left?: string
  right?: string
  ending?: string
  repeatCount?: number
}

export type PlaybackPlan = {
  sequence: string[]
  passesByNode: ReadonlyMap<string, ReadonlySet<number>>
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
  if (measures.some((measure) => measure.ending)) {
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
    return passesByMeasure
  }

  const nodes: PlaybackNode[] = measures.map((measure, index) => ({
    id: String(index),
    kind: measure.ending ? 'ending' : 'section',
    n: measure.ending,
    repeatStart: measure.left === 'rptstart',
    repeatCount: measure.repeatCount ?? (measure.right === 'rptend' ? 2 : undefined),
    navigation: measure.navigation ?? measure.events.flatMap((event) => event.navigation),
  }))
  const passesByMeasure = new Map<T, Set<number>>(measures.map((measure) => [measure, new Set()]))
  const visits = new Map<number, number>()

  for (const id of planPlayback(nodes).sequence) {
    const index = Number(id)
    const measure = measures[index]
    if (!measure) continue
    if (measure.ending) {
      passesByMeasure.set(measure, parsePassRange(measure.ending))
      continue
    }
    const pass = (visits.get(index) ?? 0) + 1
    visits.set(index, pass)
    passesByMeasure.get(measure)?.add(pass)
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

function appendNavigationReturn(nodes: readonly PlaybackNode[], initial: string[]) {
  const jumpIndex = nodes.findIndex((node) => node.navigation?.some((value) => value === 'ds' || value === 'dc'))
  if (jumpIndex < 0) return initial
  const jump = nodes[jumpIndex]!
  const destination = jump.navigation?.includes('ds')
    ? nodes.findIndex((node) => node.navigation?.includes('segno'))
    : nodes.findIndex((node) => node.kind === 'section')
  const fine = nodes.findIndex((node) => node.navigation?.includes('fine'))
  if (destination < 0) return initial
  const played = initial.lastIndexOf(jump.id)
  if (played < 0) return initial
  const end = fine >= 0 ? fine : jumpIndex
  return [...initial.slice(0, played + 1), ...nodes.slice(destination, end + 1).flatMap((node) => (
    node.kind !== 'ending' || !node.n || node.n.split(',').includes('2') ? node.id : []
  ))]
}

/** Returns written node ids in performance order, including one navigation return. */
export function buildPlaybackSequence(nodes: readonly PlaybackNode[]) {
  return appendNavigationReturn(nodes, expandInitialPasses(nodes))
}

/** Plans playback order and visit numbers from the same expanded sequence. */
export function planPlayback(nodes: readonly PlaybackNode[]): PlaybackPlan {
  const sequence = buildPlaybackSequence(nodes)
  const visits = new Map<string, number>()
  const passesByNode = new Map<string, Set<number>>()
  for (const id of sequence) {
    const pass = (visits.get(id) ?? 0) + 1
    visits.set(id, pass)
    const passes = passesByNode.get(id) ?? new Set<number>()
    passes.add(pass)
    passesByNode.set(id, passes)
  }
  return { sequence, passesByNode }
}

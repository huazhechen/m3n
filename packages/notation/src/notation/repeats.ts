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
  orderPasses?: readonly number[]
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

/** Expand local repeats and multi-measure alternate endings within one section. */
export function playbackMeasureIndexes(measures: readonly PlaybackMeasure[]): number[] {
  const groups: number[][] = [], nodes: PlaybackNode[] = []
  for (let index = 0; index < measures.length;) {
    const first = measures[index]!, group = [index++]
    if (first.ending) while (measures[index]?.ending === first.ending) group.push(index++)
    const last = measures[group.at(-1)!]!
    nodes.push({ id: String(groups.length), kind: first.ending ? 'ending' : 'section', n: first.ending,
      repeatStart: first.left === 'rptstart', repeatCount: last.repeatCount ?? (last.right === 'rptend' ? 2 : undefined),
      navigation: group.flatMap(index => navigationOf(measures[index]!)) })
    groups.push(group)
  }
  return planPlayback(nodes).sequence.flatMap(id => groups[Number(id)]!)
}

/** Without local repeat bars, houses select the numbered visit in order. */
export function hasVisitEndings(measures: readonly PlaybackMeasure[]) {
  return measures.some(measure => measure.ending)
    && !measures.some(measure => measure.left === 'rptstart' || measure.right === 'rptend')
}

export function sectionVisitMeasureIndexes(measures: readonly PlaybackMeasure[], visit: number) {
  return hasVisitEndings(measures)
    ? measures.flatMap((measure, index) => !measure.ending || parsePassRange(measure.ending).has(visit) ? [index] : [])
    : playbackMeasureIndexes(measures)
}

/** Resolve the itinerary once, preserving original indexes for all consumers. */
export function orderedMeasureIndexes<T extends PlaybackMeasure & { sectionName?: string }>(measures: readonly T[], order: readonly string[]) {
  return orderedMeasureVisits(measures, order).map(visit => visit.index)
}

export function orderedMeasureVisits<T extends PlaybackMeasure & { sectionName?: string }>(measures: readonly T[], order: readonly string[]) {
  const visits = new Map<string, number>()
  return order.flatMap((name, orderIndex) => {
    const visit = (visits.get(name) ?? 0) + 1
    visits.set(name, visit)
    const entries = measures.map((measure, index) => ({ measure, index })).filter(item => item.measure.sectionName === name)
    return sectionVisitMeasureIndexes(entries.map(item => item.measure), visit).map(index => ({ index: entries[index]!.index, orderIndex }))
  })
}

/** Returns the playback passes in which each written measure occurs. */
export function measurePlaybackPasses<T extends PlaybackMeasure>(measures: readonly T[]) {
  if(measures.some(measure=>measure.orderPasses))return new Map<T,Set<number>>(measures.map(measure=>[measure,new Set(measure.orderPasses ?? [1])]))
  if (measures.some(measure => navigationOf(measure).some(value => value === 'ds' || value === 'dc'))) {
    const passes = new Map<T, Set<number>>(measures.map(measure => [measure, new Set()]))
    for (const index of playbackMeasureIndexes(measures)) {
      const measure = measures[index]!
      if (measure.ending) passes.set(measure, parsePassRange(measure.ending))
      else {
        const visits = passes.get(measure)!
        visits.add(visits.size + 1)
      }
    }
    return passes
  }
  const endingRepeatIndex = measures.findIndex((measure) => measure.ending && measure.right === 'rptend')
  const commonRepeatAfterEndings = endingRepeatIndex >= 0 && measures.slice(endingRepeatIndex + 1)
    .some((measure) => !measure.ending && measure.right === 'rptend')
  if (commonRepeatAfterEndings
    && !measures.some((measure) => navigationOf(measure).some((value) => value === 'ds' || value === 'dc'))) {
    // A common repeat after alternate endings can reach the verse more often
    // than the chorus. Fold multi-measure houses into single playback nodes
    // and count those common passages from the actual plan.
    const groups: Array<{ node: PlaybackNode; measures: T[] }> = []
    for (const measure of measures) {
      const previous = groups.at(-1)
      const node: PlaybackNode = {
        id: String(groups.length),
        kind: measure.ending ? 'ending' : 'section',
        n: measure.ending,
        repeatStart: measure.left === 'rptstart',
        repeatCount: measure.repeatCount ?? (measure.right === 'rptend' ? 2 : undefined),
        navigation: navigationOf(measure),
      }
      if (measure.ending && previous?.node.n === measure.ending && !previous.node.repeatCount) {
        previous.measures.push(measure)
        previous.node.repeatCount = node.repeatCount
        previous.node.navigation = [...(previous.node.navigation ?? []), ...(node.navigation ?? [])]
      } else {
        groups.push({ node, measures: [measure] })
      }
    }
    const plan = planPlayback(groups.map((group) => group.node))
    return new Map<T, Set<number>>(groups.flatMap(({ node, measures: group }) => {
      const passes = node.n ? parsePassRange(node.n) : new Set(plan.passesByNode.get(node.id))
      return group.map((measure) => [measure, new Set(passes)] as const)
    }))
  }
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
      const groupStart = index + 1
      for (let endingIndex = groupStart; measures[endingIndex]?.ending; endingIndex += 1) {
        const ending = measures[endingIndex]?.ending
        if (ending) for (const pass of parsePassRange(ending)) passCount = Math.max(passCount, pass)
        const navigation = navigationOf(measures[endingIndex])
        if (navigation.some((value) => value === 'ds' || value === 'dc')) break
      }
      for (let repeatedIndex = repeatStart; repeatedIndex <= index; repeatedIndex += 1) {
        const repeated = measures[repeatedIndex]
        if (repeated) passesByMeasure.set(repeated, new Set(Array.from({ length: passCount }, (_, pass) => pass + 1)))
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

function navigationOf<T extends PlaybackMeasure>(measure: T | undefined) {
  return measure?.navigation ?? measure?.events.flatMap((event) => event.navigation) ?? []
}

function chooseEndings(nodes: readonly PlaybackNode[], start: number, end: number, pass: number) {
  return nodes.slice(start, end + 1).flatMap((node, offset) =>
    parsePassRange(node.n ?? '').has(pass) ? [start + offset] : [])
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
    const node = nodes[index]
    if (!node) break
    const endingGroup = endingGroups.get(index)
    if (endingGroup) {
      const visit = (repeatVisits.get(index) ?? 0) + 1
      repeatVisits.set(index, visit)
      const selectedIndexes = chooseEndings(nodes, index, endingGroup.end, Math.min(visit, endingGroup.passCount))
      let repeat = false
      // A shared house can be followed by a continuation for the same pass.
      // Execute a taken repeat/jump before visiting any later continuation.
      for (const selectedIndex of selectedIndexes) {
        const selected = nodes[selectedIndex]!
        sequence.push(selected.id)
        if (selected.repeatCount && visit < selected.repeatCount) { repeat = true; break }
        if (selected.navigation?.some(value => value === 'ds' || value === 'dc' || value === 'fine')) break
      }
      if (repeat) {
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

  const jumpPass = jump.n === undefined ? undefined : Math.min(...parsePassRange(jump.n))
  const firstEnding = jumpPass === undefined ? -1 : nodes.findIndex((node, index) => index >= destination && node.kind === 'ending')
  const sectionEnd = Math.min(fine >= 0 ? fine + 1 : nodes.length, firstEnding >= 0 ? firstEnding : nodes.length)
  const sections = nodes.slice(destination, sectionEnd)
    .filter((node) => node.kind === 'section')
    .map((node) => node.id)
  const endingNodes = nodes.filter((node) => node.kind === 'ending')
  if (jumpPass === undefined || !Number.isFinite(jumpPass)) {
    return [...initial.slice(0, played + 1), ...sections]
  }

  // A D.S. may appear in more than one alternate ending. Continue through
  // the next numbered houses after each return, allowing a later DS to trigger
  // another pass, and stop when the return reaches Fine.
  const returnPart: string[] = []
  const appendTail = (after: number) => {
    // The jump's ending group can be followed by an ordinary coda even when
    // there is no further numbered house for the navigation return.
    let index = after + 1
    while (nodes[index]?.kind === 'ending') index += 1
    for (; index < nodes.length; index += 1) {
      const tail = nodes[index]!
      if (tail.kind !== 'section') break
      returnPart.push(tail.id)
      if (tail.navigation?.includes('fine')) break
    }
  }
  let nextPass = jumpPass + 1
  for (let iteration = 0; iteration < endingNodes.length + 1; iteration += 1) {
    const houses = endingNodes.filter((node) => parsePassRange(node.n ?? '').has(nextPass))
    returnPart.push(...sections)
    if (!houses.length) {
      if (fine < 0 || fine >= sectionEnd) appendTail(jumpIndex)
      break
    }
    let house = houses[0]!
    for (const selected of houses) {
      house = selected
      returnPart.push(house.id)
      if (house.navigation?.some(value => value === 'ds' || value === 'dc' || value === 'fine')) break
    }
    if (house.navigation?.includes('fine')) break
    if (!house.navigation?.some((value) => value === 'ds' || value === 'dc')) {
      // After the final return ending, continue into the ordinary tail once.
      appendTail(nodes.indexOf(house))
      break
    }
    nextPass += 1
  }
  return [...initial.slice(0, played + 1), ...returnPart]
}

/** Returns written node ids in performance order, including navigation returns. */
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

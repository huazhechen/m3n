/** Sum current-run work only; reused candidate timings describe an earlier run. */
export function summarizeMeasurements(records) {
  const totals = {}, continuous = {}
  const add = (target, timings = {}) => {
    for (const [name, value] of Object.entries(timings)) if (typeof value === 'number') target[name] = (target[name] ?? 0) + value
  }
  const scores = records.map(entry => {
    const stages = {}, continuousStages = {}
    if (!entry.measurement.reused) for (const candidate of entry.candidates) {
      add(stages, candidate.timings)
      add(continuousStages, candidate.timings?.continuous)
    }
    add(totals, stages); add(continuous, continuousStages)
    return { file: entry.file, title: entry.title, ...entry.measurement, stages, continuous: continuousStages,
      candidates: entry.measurement.reused ? [] : entry.candidates.map(candidate => ({ width: candidate.width, error: candidate.error, timings: candidate.timings })) }
  })
  return { scoreWallMs: records.reduce((sum, entry) => sum + entry.measurement.wallMs, 0), candidateTotals: totals, continuousTotals: continuous,
    slowestScores: scores.filter(score => !score.reused).map(({ candidates: _candidates, ...score }) => score).sort((a, b) => b.wallMs - a.wallMs).slice(0, 10), scores }
}

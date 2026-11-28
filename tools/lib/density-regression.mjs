export const densityLimits = {
  // v37 comfort scoring selects the loose tier: 12 rows / 698px. Keep the
  // existing height, font and ink gates while accepting this intended plan.
  butter_fly_01: { staffHeight: 860, staffRows: 12, numberedHeight: 700, numberedRows: 12, heightRatio: 1.24 },
  badinerie_bwv1067_01: { staffHeight: 800, staffRows: 10, numberedHeight: 720, numberedRows: 10, heightRatio: 1.61 },
  flower_dance_01: { staffHeight: 2470, staffRows: 33, numberedHeight: 1850, numberedRows: 30, heightRatio: 1.44 },
  mozart_k545_01: { staffHeight: 2190, staffRows: 25, numberedHeight: 1570, numberedRows: 23, heightRatio: 1.43 },
  guo_huo_01: { staffHeight: 1130, staffRows: 11, numberedHeight: 760, numberedRows: 9, heightRatio: 1.57 },
  // Ordinary phrase separators permit automatic reflow; constrain density, not one historical break plan.
  ma_li_you_zhi_xiao_gao_yang_01: { staffHeight: 210, staffRows: 2, numberedHeight: 230, numberedRows: 2, heightRatio: 1.5 },
  ban_yin_jie_kou_qin_ji_ben_gong_01: { staffHeight: 3410, staffRows: 47, numberedHeight: 2450, numberedRows: 42, heightRatio: 1.49 },
  ni_shi_wo_xin_ai_de_gu_niang_01: { staffHeight: 1300, staffRows: 10, numberedHeight: 1060, numberedRows: 9, heightRatio: 1.26 },
}

/** Physical size, density and explicit musical boundaries are stable contracts.
 * Soft phrase boundaries may reflow when spacing/scoring changes.
 */
export function densityRegressionFailures(result, limit, width) {
  const failures = []
  for (const notation of ['staff', 'numbered']) {
    const layout = result[notation]
    for (const key of ['naturalHeight', 'rows', 'pages', 'displayedEvents']) {
      if (!Number.isFinite(layout[key]) || layout[key] <= 0) failures.push(`${notation} invalid ${key}`)
    }
    if (layout.naturalHeight > limit[`${notation}Height`]) failures.push(`${notation} continuous height`)
    if (layout.rows > limit[`${notation}Rows`]) failures.push(`${notation} row count`)
    for (const id of limit.lineEnds ?? []) {
      if (!layout.measureRows.some(row => row.at(-1) === id)) failures.push(`${notation} explicit line end ${id}`)
    }
  }
  if (result.staff.naturalHeight / result.numbered.naturalHeight > limit.heightRatio) failures.push('height ratio')
  if (result.staff.displayedEvents !== result.numbered.displayedEvents) failures.push('displayed events')
  for (const [key, expected] of Object.entries({ staffFrameMm: 7.55625, numberedFrameMm: 8.71875, lyricEmMm: 4.65 })) {
    if (!Number.isFinite(result.readability[key]) || Math.abs(result.readability[key] - expected * 640 / width) > .001) failures.push(key)
  }
  return failures
}

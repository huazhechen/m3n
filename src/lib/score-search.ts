type SearchableScore = {
  searchText: string
  isLocal: boolean
  hasLyrics: boolean
  hasBass: boolean
  keySignature: string
  timeSignature: string
}

export function matchesScoreSearch(score: SearchableScore, query: string) {
  const terms = query.toLocaleLowerCase('zh-Hans-CN').trim().split(/\s+/).filter(Boolean)
  return terms.every(term => {
    if (['词', '歌词', '有歌词'].includes(term)) return score.hasLyrics
    if (['低', '低音', '有低音'].includes(term)) return score.hasBass
    if (['本地', '本地作品'].includes(term)) return score.isLocal
    if (['内置', '内置曲库'].includes(term)) return !score.isLocal
    if (/^\d+\/\d+$/.test(term)) return score.timeSignature === term
    if (/^[a-g](?:#|b)?(?:m|dor|phr|lyd|mix|loc)?$/.test(term)) {
      return score.keySignature.toLowerCase() === term
    }
    return score.searchText.toLocaleLowerCase('zh-Hans-CN').includes(term)
  })
}

import type { ScoreDocument } from './notation/score-document.js'

/** Display policy shared by both engraving engines; source metadata stays intact. */
export function numberedHeaderContent(document: ScoreDocument) {
  const credits = document.lyricist && document.lyricist === document.composer
    ? [`${document.lyricist} 词曲`]
    : [
      document.lyricist ? `${document.lyricist} 作词` : '',
      document.composer ? `${document.composer} 作曲` : '',
    ]
  return {
    subtitles: [document.subtitle, document.singer ? `${document.singer} 演唱` : ''].filter(Boolean),
    credits: [
      ...credits,
      document.origin,
    ].filter(Boolean),
  }
}

import type { ScoreDocument } from '@m3n/notation'

/** Display policy shared by both engraving engines; source metadata stays intact. */
export function numberedHeaderContent(document: ScoreDocument) {
  return {
    subtitles: [document.subtitle, document.singer ? `${document.singer} 演唱` : ''].filter(Boolean),
    credits: [
      document.lyricist ? `${document.lyricist} 作词` : '',
      document.composer ? `${document.composer} 作曲` : '',
      document.origin,
    ].filter(Boolean),
  }
}

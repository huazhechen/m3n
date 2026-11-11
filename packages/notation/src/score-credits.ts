import type { ScoreDocument } from './notation/score-document.js'

/** Keep every declared role, even when one person has several credits. */
export function scoreCreditLines(document: Pick<ScoreDocument, 'lyricist' | 'composer' | 'arranger' | 'singer'>): string[] {
  return ([
    ['作词', document.lyricist],
    ['作曲', document.composer],
    ['编曲', document.arranger],
    ['演唱', document.singer],
  ] as const).flatMap(([role, name]) => name ? [`${role}：${name}`] : [])
}

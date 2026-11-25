/** One place to edit score typography and layout dimensions.
 * Sizes and distances use logical score px; coefficients are named ratios.
 * Presentation scales the whole SVG. Font ink and final coordinates stay fractional.
 * Secondary music glyph sizes preserve their existing measured silhouettes.
 */
// 共用歌词：字号、横向留白、音乐到歌词的净空、歌词行间净空。
const lyrics = { fontSize: 16, horizontalPadding: 1, musicGap: 6, rowGap: 4 } as const

const numbered = {
  // 简谱字号（px）。grace 是表情文字，graceNote 才是倚音。
  music: 24,
  text: 16,
  annotation: 14,
  lyric: lyrics.fontSize,
  lyricTopGap: lyrics.musicGap,
  lyricGap: lyrics.rowGap,
  grace: 13,
  graceNote: 15,
  fingering: 11,
  meter: 18,
  title: 32,
  subtitle: 16,
  credit: 14,
  small: 12,
  // Secondary text and music glyph sizes are independent of the main digits.
  tuplet: 17.28,
  volta: 14.4,
  navigation: 16,
  fine: 16.8,
  navigationSymbol: 18.4,
  breath: 10,
  staccatissimo: 7,
  tenuto: 1.26,
  repeatCount: 13,
  measureNumber: 10,
  // 线宽与记号净空（px）。
  stroke: 1.4,
  symbolStroke: 1.2,
  markGap: 2.8,
  // 声部／谱行净空：谱源 {leading=18} 可覆盖 minimumCoreGap，单位同为 px。
  laneGap: 20,
  minimumCoreGap: 28,
  maximumCoreGap: 32,
  // 自动选距按候选进行整曲评分；minimumNoteGap 是基础候选。
  minimumNoteGap: 9,
  noteGapCandidates: [9, 12, 15] as readonly number[],
  // 谱头（px）：LineHeight 是换行基线推进，其余 Gap 是墨迹间净空。
  headerGap: 24,
  titleLineHeight: 36,
  subtitleLineHeight: 18,
  titleSubtitleGap: 8,
  titleSideGap: 18,
  headerRowGap: 5,
  headerCollisionGap: 8,
  // 段名及行内内容间距（px）。
  sectionGap: 12,
  sectionHeadingGap: 6,
  annotationGap: 6,
  chordGap: 7,
  headingBarGap: 2,
  signatureItemGap: 16,
  inlineSectionGap: 12,
  // 小节号只参与页面边界留白，不参与元素碰撞；隐藏时仍计入边界。
  measureNumberBarGap: 2,
  measureNumberPadding: 2,
  // 无单位比例：拍组内部间距、相邻谱行碰撞净空。
  groupSpacingRatio: 0.5,
  collisionGapRatio: 0.5,
}

/** Staff music glyphs are sized by VexFlow; project-owned text is configured here. */
const staff = {
  title: 32, subtitle: 16, credit: 14, text: 16,
  annotation: 16, annotationLineHeight: 20,
  tempo: 15, chord: 14, dynamic: 16, fingering: 13,
  restCount: 16, measureNumber: 12, navigation: 14, volta: 12,
  expression: 14, octave: 13,
  minimumCoreGap: 28, maximumCoreGap: 32,
} as const

// 图片导出页脚：保留随谱宽缩放的现有行为。
const imageExport = { footerMinimumFontSize: 12, footerFontSizeWidthRatio: 0.02 } as const

export const scoreLayoutConfig = { numbered, lyrics, staff, imageExport }

/** One place to edit score typography and layout dimensions.
 * Independent typography and page spacing use logical score px.
 * Presentation scales the whole SVG. Font ink and final coordinates stay fractional.
 * Music-attached geometry is derived from the core font em at its use sites.
 */
// 共用歌词：字号、横向留白、音乐到歌词的净空、歌词行间净空。
const lyrics = { fontSize: 16, horizontalPadding: 1, preferredExtraGap: 2, musicGap: 6, rowGap: 4 } as const

const fontFamilies = {
  latin: 'Barlow Semi Condensed', cjk: 'Noto Sans SC', music: 'Bravura',
} as const
const fonts = {
  ...fontFamilies,
  text: `${fontFamilies.latin}, ${fontFamilies.music}, ${fontFamilies.cjk}`,
  title: `${fontFamilies.latin}, ${fontFamilies.cjk}, ${fontFamilies.music}`,
  titleWeight: 500, textWeight: 500, regularWeight: 400, boldWeight: 700,
  // Large-em glyph measurement avoids pixel rounding of small music symbols.
  measurementSize: 1000,
} as const

const numberedMusic = 24
const numberedCoreGapEm = 1.2
// 曲间最小留白为默认核心间距的1.25倍（当前36px）。
const sharedScoreGapCoreRatio = 1.25
const sharedScoreGap = numberedMusic * numberedCoreGapEm * sharedScoreGapCoreRatio

const typography = { title: 32, subtitle: 16, credit: 14, text: 16, annotation: 14,
  navigation: 16, fine: 16.8, measureNumber: 10, fingering: 12, expression: 13, voltaLabel: 14.4, repeatCount: 13 }

const numbered = {
  ...typography,
  // 独立文字字号（px）；音符附属字形在实现中按 music 的 em 比例计算。
  music: numberedMusic,
  // 正圆直径：八度点0.15em、时值附点0.18em；倚音同比缩放。
  octaveDotRadiusEm: .075,
  durationDotRadiusEm: .09,
  accidentalScale: 1.15,
  // 核心上下间距，以 music 为1em；外层净空在使用处乘系数。
  coreGapEm: numberedCoreGapEm, // 谱源 leading 以em覆盖，作用于全部派生上下间距。
  lyric: lyrics.fontSize,
  grace: 13,

  // 外层表情与导航文字保持独立字号。
  // 紧／松两档最小净空；时值与组内比例由横向引擎换算。
  minimumNoteGap: 8,
  noteGapCandidates: [8, 16] as readonly number[],
  // 文字换行行高独立于音乐字号和核心间距。
  titleLineHeight: 36,
  subtitleLineHeight: 18,

  // 行内横向间距（px）。
  headingBarGap: 2,
  signatureItemGap: 16,
  inlineSectionGap: 12,
  // 小节号只参与页面边界留白，不参与元素碰撞；隐藏时仍计入边界。
  measureNumberBarGap: 2,
  measureNumberPadding: 2,
  // 无单位比例：拍组内部间距、相邻谱行碰撞净空。
  groupSpacingRatio: 0.5,
  collisionGapRatio: 0.5,
  // 页面与文字的独立设计 px；音符内部几何不另设配置。
  defaultPageMargin: 32, minimumWidth: 320, minimumContentWidth: 40,
  headerWrapInset: 2,
  frameStroke: 1,
  navigationGap: 4.4,
  openingBarFallbackInset: 2, closingBarFallbackInset: 3,
  sharedScoreGap,
}

/** Native staff music and text share the same typography policy. */
const staffScale = 0.7
const staff = {
  ...typography,
  annotationLineHeight: 20,
  tempo: typography.annotation, chord: typography.annotation, dynamic: typography.expression,
  restCount: 16, octave: 13,
  // 音乐主字号为最终逻辑 px；倚音、速度音符、琶音与连音数字由其推导。
  music: 40 * staffScale,
  spacingIncrementSpaces: 1.2,

  headerRowGap: 5, headerSideGap: 14, headerBottomGap: 7,
  headerWrapInset: 2, orderTopGap: 12, orderItemGap: 4,
  orderArrowWidth: 14, orderArrowHeight: 10, orderArrowTip: 4, orderArrowAdvance: 20,
  orderFramePadding: 4, frameStroke: 1,
  sectionLabelInset: 21, contentEdgeInset: 4, attachmentGap: 6, attachmentWrapInset: 12,
  lyricUnderlineHalfWidth: 0.5,
  measureNumberPadding: 2, measureNumberBarGap: 2, attachmentRowTolerance: 10,
  attachmentStandaloneGap: 12, attachmentHorizontalGap: 3.5, attachmentFramePadding: 4, repeatMarkGap: 4,
  headingLeftInset: 0.5, edgeGap: 2, sectionGap: 12, pageInset: 2,
  minimumWidth: 320, minimumContentWidth: 80, bassGutter: 14, singleGutter: 1, rightGutter: 1,
  groupSpacingRatio: 0.75,
  minimumNoteGap: 0.6,
  noteGapCandidates: [0.6, 1.2] as readonly number[],
  // 引擎缩放及独立排版距离；符干、符杠、谱线等在使用处按字体 em 推导。
  engine: {
    scale: staffScale,
    bassY: 140, initialBassY: 130,
    fragmentSafetyInset: 20, spacingUnit: 22, minimumMeasureWidth: 40,
    lyricInitialOffset: 30, lyricUnderlineOffset: 4, attachmentTopGap: 40, dynamicBottomGap: 35,
    navigationBarInset: 15, navigationY: -10,
    restCountGap: 2, measureNumberOffset: 10,
    endingBarInset: 3, endingTextInset: 4, endingTextY: 22,
    slurInkSlice: 4,
    expressionBottomGap: 30,
    octaveAboveGap: 40, octaveBelowGap: 35, octaveTextWidth: 25,
    expressionTopGap: 25,
    bassAdjustmentGap: 5,
  },
}

// 图片导出页脚：保留随谱宽缩放的现有行为。
const imageExport = { footerMinimumFontSize: 12, footerFontSizeWidthRatio: 0.02, marginRatio: 0.06, footerMarginRatio: 1.55 } as const
const rendering = { offscreenPosition: -20000, auditOffscreenPosition: -100000, previewPageGap: 16 } as const
const scorebook = {
  sharedScoreGapCoreRatio, sharedScoreGap,
  contentsLeaderSpaceEm: .35, contentsLeaderMinimumEm: 1,
  coverTitle: 40, coverWebsite: 18, contentsTitle: 30, sectionTitle: 16, entryTitle: 16, pageNumber: 14,
  coverTitleY: 350, coverWebsiteY: 410, contentsLeft: 40, contentsTop: 65,
  columnStep: 377, contentsRowsTop: 120, contentsBottomInset: 40, pageNumberOffset: 337,
} as const

// 自动版宽为24px的22–32倍（528–768px）；合页在26倍（624px）准入，搜索22–26倍。
const pageWidth = {
  unit: numbered.music,
  minimumMultiple: 22,
  maximumMultiple: 32,
  sharedMaximumMultiple: 26,
  defaultMultiple: 30,
  // 页面手动滑条范围，独立于自动搜索的十一档。
  manualMinimumMultiple: 20,
  manualMaximumMultiple: 40,
} as const

export const scoreLayoutConfig = { fonts, numbered, lyrics, staff, imageExport, rendering, scorebook, pageWidth }

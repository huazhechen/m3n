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

const page = { collisionGapRatio: 0.5 } as const

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
  // Compatibility alias; the shared page policy owns this value.
  collisionGapRatio: page.collisionGapRatio,
  // 页面与文字的独立设计 px；音符内部几何不另设配置。
  defaultPageMargin: 32, minimumWidth: 320, minimumContentWidth: 40,
  // Hinting and raster coverage can extend past the mathematical outline.
  // Keep their fixed frame allowance separate from the glyph design metrics.
  designInkEdgeGuard: 2,
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
  music: 28, // 四个7px谱间。
  // 既有五线谱独立几何以28px（四个7px谱间）为设计基准。
  get musicSizeRatio(): number { return this.music / 28 },
  spacingIncrementSpaces: 1.2,

  headerRowGap: 5, headerSideGap: 14, headerBottomGap: 7,
  headerWrapInset: 2, orderTopGap: 12, orderItemGap: 4,
  orderArrowWidth: 14, orderArrowHeight: 10, orderArrowTip: 4, orderArrowAdvance: 20,
  orderFramePadding: 4, frameStroke: 1,
  sectionLabelInset: 21, contentEdgeInset: 4,
  get attachmentGap(): number { return 6 * this.musicSizeRatio },
  attachmentWrapInset: 12,
  lyricUnderlineHalfWidth: 0.5,
  measureNumberPadding: 2, measureNumberBarGap: 2, attachmentRowTolerance: 10,
  attachmentStandaloneGap: 12, attachmentHorizontalGap: 3.5, attachmentFramePadding: 4, repeatMarkGap: 4,
  headingLeftInset: 0.5, edgeGap: 2, sectionGap: 12, pageInset: 2,
  minimumWidth: 320, minimumContentWidth: 80, bassGutter: 14, singleGutter: 1, rightGutter: 1,
  groupSpacingRatio: 1,
  minimumNoteGap: 0.6,
  noteGapCandidates: [0.6, 1.8] as readonly number[],
  // 引擎坐标变换保持不变；音乐附属距离按既有28px设计比例随music变化。
  // 歌词、文字占宽及曲线包络分片精度继续使用独立尺寸。
  engine: {
    scale: staffScale,
    get bassY(): number { return 140 * staff.musicSizeRatio },
    get initialBassY(): number { return 130 * staff.musicSizeRatio },
    get fragmentSafetyInset(): number { return 20 * staff.musicSizeRatio },
    spacingUnit: 22,
    get minimumMeasureWidth(): number { return 40 * staff.musicSizeRatio },
    lyricInitialOffset: 30, lyricUnderlineOffset: 4,
    get attachmentTopGap(): number { return 40 * staff.musicSizeRatio },
    get dynamicBottomGap(): number { return 35 * staff.musicSizeRatio },
    get navigationBarInset(): number { return 15 * staff.musicSizeRatio },
    get navigationY(): number { return -10 * staff.musicSizeRatio },
    restCountGap: 2,
    get measureNumberOffset(): number { return 10 * staff.musicSizeRatio },
    get endingBarInset(): number { return 3 * staff.musicSizeRatio },
    get endingTextInset(): number { return 4 * staff.musicSizeRatio },
    get endingTextY(): number { return 22 * staff.musicSizeRatio },
    slurInkSlice: 4,
    get expressionBottomGap(): number { return 30 * staff.musicSizeRatio },
    get octaveAboveGap(): number { return 40 * staff.musicSizeRatio },
    get octaveBelowGap(): number { return 35 * staff.musicSizeRatio },
    octaveTextWidth: 25,
    get expressionTopGap(): number { return 25 * staff.musicSizeRatio },
    get bassAdjustmentGap(): number { return 5 * staff.musicSizeRatio },
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

// 自动版宽为24px的22–30倍（528–720px）；合页在26倍（624px）准入，搜索22–26倍。
const pageWidth = {
  unit: numbered.music,
  minimumMultiple: 22,
  maximumMultiple: 30,
  sharedMaximumMultiple: 26,
  defaultMultiple: 30,
  // 页面手动滑条范围，独立于自动搜索的九档。
  manualMinimumMultiple: 10,
  manualMaximumMultiple: 50,
} as const

export const scoreLayoutConfig = { page, fonts, numbered, lyrics, staff, imageExport, rendering, scorebook, pageWidth }

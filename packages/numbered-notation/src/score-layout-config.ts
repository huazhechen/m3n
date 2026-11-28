/** One place to edit score typography and layout dimensions.
 * Independent typography and page spacing use logical score px.
 * Presentation scales the whole SVG. Font ink and final coordinates stay fractional.
 * Music-attached geometry is derived from the core font em at its use sites.
 */
// 歌词横向两两间距随音乐三档选择；纵向净空共用M/8。
const numberedMusic = 24
const lyrics = { fontSize: numberedMusic * 2 / 3, pairGaps: [0, numberedMusic / 24, numberedMusic / 12] } as const

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

// All numbered typography is derived from its music em. Staff shares text sizes.
const sharedScoreGapRowRatio = 1.2
const sharedScoreGap = numberedMusic * .75 * sharedScoreGapRowRatio
const typography = { title: numberedMusic * 4 / 3, subtitle: numberedMusic * 2 / 3,
  credit: numberedMusic * .6, text: numberedMusic * 2 / 3, annotation: numberedMusic * .6,
  navigation: numberedMusic * 2 / 3, fine: numberedMusic * 2 / 3,
  measureNumber: numberedMusic / 2, fingering: numberedMusic / 2, expression: numberedMusic / 2,
  voltaLabel: numberedMusic * .6, repeatCount: numberedMusic * .6 }

// 行内净空按各谱式音乐字号除以下列系数，不随档位或行距变化。
const page = { collisionGapRatio: 0.5, attachmentGapDivisor: 12, lyricGapDivisor: 8, annotationGapDivisor: 6, chordGapDivisor: 6 } as const

const numbered = {
  ...typography,
  // 文字字号随音乐字号定义；音符附属字形在使用处按 em 比例计算。
  music: numberedMusic,
  // 正圆直径：八度点0.15em、时值附点0.18em；倚音同比缩放。
  octaveDotRadiusEm: .075,
  durationDotRadiusEm: .09,
  accidentalScale: 1.15,
  tupletFontSize: numberedMusic * .7,
  tupletHookLength: numberedMusic * .18,
  tupletStroke: numberedMusic / 20,
  hairpinStroke: numberedMusic * .035,
  hairpinHalfOpening: numberedMusic * .2,
  voltaStroke: numberedMusic * .055,
  voltaTextInset: numberedMusic * .15,
  voltaHookRatio: 1.2,
  minimumRowGapEm: .75,
  lyric: lyrics.fontSize,

  // 三档最小净空；时值与组内比例由横向引擎换算。
  minimumNoteGap: numberedMusic / 3,
  noteGapCandidates: [numberedMusic / 3, numberedMusic / 2, numberedMusic * 2 / 3] as readonly number[],
  // 标题换行行高随对应文字字号。
  titleLineHeight: typography.title,
  subtitleLineHeight: typography.subtitle,

  // 行内横向间距（px）。
  headingBarGap: numberedMusic / 12,
  signatureItemGap: numberedMusic * 2 / 3,
  inlineSectionGap: numberedMusic / 2,
  // 小节号只参与页面边界留白，不参与元素碰撞；隐藏时仍计入边界。
  measureNumberBarGap: numberedMusic / 12,
  measureNumberPadding: numberedMusic / 12,
  // 无单位比例：拍组内部间距、相邻谱行碰撞净空。
  groupSpacingRatio: 0.75,
  // 无时值元素两侧固定采用四分音符的此比例，不读取相邻音符时值。
  zeroDurationGapRatio: 1,
  // Compatibility alias; the shared page policy owns this value.
  collisionGapRatio: page.collisionGapRatio,
  // 页面与文字的独立设计 px；音符内部几何不另设配置。
  defaultPageMargin: 32, minimumWidth: 320, minimumContentWidth: 40,
  // Hinting and raster coverage can extend past the mathematical outline.
  // Frame allowance scales with M while remaining separate from outline metrics.
  designInkEdgeGuard: numberedMusic / 12,
  headerWrapInset: numberedMusic / 12,
  frameStroke: numberedMusic / 24,
  openingBarFallbackInset: numberedMusic / 12, closingBarFallbackInset: numberedMusic / 8,
  sharedScoreGap,
}

/** M and N belong to the shared policy; S alone controls staff engraving.
 * Engine coordinates are logical score dimensions divided by engine.scale.
 */
const staffScale = 0.7
const staff = {
  ...typography,
  annotationLineHeight: typography.annotation,
  tempo: typography.text, chord: typography.annotation, dynamic: typography.expression,
  restCount: typography.text, octave: typography.expression,
  space: 7.5,
  get music(): number { return 4 * this.space },
  // Compatibility for consumers adjusting the music em: S remains the source.
  set music(value: number) { this.space = value / 4 },
  graceRatio: .6,
  reuseBeamOuterSpace: true,
  get beamDirectionNearHeight(): number { return this.space / 8 },
  stemDefaultSpaces: 3.5,
  stemCompactMinimumSpaces: 3,
  slurMaximumEndpointSlope: .25,
  get minimumRowGapEm(): number { return 2 * this.space / numbered.music },
  spacingIncrementSpaces: 1.2,
  get interStaffGap(): number { return 3 * this.space },
  headerWrapInset: numbered.headerWrapInset,
  orderItemGap: numberedMusic / 6,
  orderArrowWidth: numberedMusic * 7 / 12, orderArrowHeight: numberedMusic * 5 / 12,
  orderArrowTip: numberedMusic / 6, orderArrowAdvance: numberedMusic * 5 / 6,
  orderFramePadding: numberedMusic / 6, frameStroke: numbered.frameStroke,
  sectionLabelInset: numberedMusic * 7 / 8, contentEdgeInset: numberedMusic / 6,
  get attachmentGap(): number { return numbered.music / page.attachmentGapDivisor },
  get lyricGap(): number { return numbered.music / page.lyricGapDivisor },
  get annotationGap(): number { return numbered.music / page.annotationGapDivisor },
  get chordGap(): number { return numbered.music / page.chordGapDivisor },
  attachmentWrapInset: numberedMusic / 2,
  lyricUnderlineHalfWidth: numberedMusic / 48,
  measureNumberPadding: numbered.measureNumberPadding, measureNumberBarGap: numbered.measureNumberBarGap,
  attachmentRowTolerance: numberedMusic * 5 / 12,
  get attachmentStandaloneGap(): number { return this.attachmentGap },
  get attachmentHorizontalGap(): number { return this.attachmentGap },
  attachmentFramePadding: numberedMusic / 6,
  get repeatMarkGap(): number { return this.attachmentGap },
  headingLeftInset: numberedMusic / 48, edgeGap: numberedMusic / 12, pageInset: numberedMusic / 12,
  minimumWidth: numbered.minimumWidth, minimumContentWidth: numbered.minimumContentWidth,
  get bassGutter(): number { return 2 * this.space },
  get singleGutter(): number { return this.space / 7 },
  get rightGutter(): number { return this.space / 7 },
  groupSpacingRatio: 1,
  rhythmicWeight(duration: number): number { return duration <= 1 ? duration : Math.sqrt(duration) },
  get rowClefInset(): number { return .8 * this.space },
  get rowStartClearance(): number { return 1.6 * this.space },
  minimumNoteGap: .8,
  noteGapCandidates: [.8, 1.6, 2.4] as readonly number[],
  get horizontalComfort(): { minimum: number; maximum: number } { const minimum = this.noteGapCandidates.at(-1)! * this.space; return { minimum, maximum: 1.5 * minimum } },
  get verticalSpacing(): { minimum: number; comfortable: number; maximum: number } { return { minimum: 2 * this.space, comfortable: 3 * this.space, maximum: 4 * this.space } },
  get tupletFontSize(): number { return numbered.tupletFontSize },
  get tupletHookLength(): number { return numbered.tupletHookLength },
  get tupletStroke(): number { return numbered.tupletStroke },
  engine: {
    scale: staffScale,
    // Four spaces of staff height + 3S clear ink + one rule thickness.
    get bassY(): number { return (4 * staff.space + staff.interStaffGap + .1 * staff.space) / staffScale },
    get initialBassY(): number { return this.bassY },
    get fragmentSafetyInset(): number { return 2 * staff.space / staffScale },
    get minimumMeasureWidth(): number { return 4 * staff.space / staffScale },
    lyricInitialOffset: numberedMusic / staffScale,
    lyricUnderlineOffset: numberedMusic / 8 / staffScale,
    get attachmentTopGap(): number { return 4 * staff.space / staffScale },
    get dynamicBottomGap(): number { return 3.5 * staff.space / staffScale },
    navigationBarInset: numberedMusic / 2 / staffScale,
    navigationY: -numberedMusic / 3 / staffScale,
    measureNumberOffset: numberedMusic / 3 / staffScale,
    endingBarInset: numberedMusic / 12 / staffScale,
    // Numerical precision, independent of physical engraving dimensions.
    slurInkSlice: 4,
    get expressionBottomGap(): number { return 3 * staff.space / staffScale },
    get octaveAboveGap(): number { return 4 * staff.space / staffScale },
    get octaveBelowGap(): number { return 3.5 * staff.space / staffScale },
    octaveTextWidth: numberedMusic * .75 / staffScale,
    get expressionTopGap(): number { return 2.5 * staff.space / staffScale },
    get bassAdjustmentGap(): number { return staff.space / 2 / staffScale },
  },
}

// 图片导出页脚：保留随谱宽缩放的现有行为。
const imageExport = { footerMinimumFontSize: 12, footerFontSizeWidthRatio: 0.02, marginRatio: 0.06, footerMarginRatio: 1.55 } as const
const rendering = { offscreenPosition: -20000, auditOffscreenPosition: -100000, previewPageGap: 16 } as const
const scorebook = {
  sharedScoreGapRowRatio, sharedScoreGap,
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
  extraPageCost: 2,
  // 页面手动滑条范围，独立于自动搜索的九档。
  manualMinimumMultiple: 10,
  manualMaximumMultiple: 50,
} as const

export const scoreLayoutConfig = { page, fonts, numbered, lyrics, staff, imageExport, rendering, scorebook, pageWidth }

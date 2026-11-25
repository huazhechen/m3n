/** One place to edit score typography and layout dimensions.
 * Sizes and distances use logical score px; coefficients are named ratios.
 * Presentation scales the whole SVG. Font ink and final coordinates stay fractional.
 * Secondary music glyph sizes preserve their existing measured silhouettes.
 */
// 共用歌词：字号、横向留白、音乐到歌词的净空、歌词行间净空。
const lyrics = { fontSize: 16, horizontalPadding: 1, musicGap: 6, rowGap: 4 } as const

const fontFamilies = {
  latin: 'Barlow Semi Condensed', cjk: 'Noto Sans SC', music: 'Bravura', numbers: 'M3N Numbers',
} as const
const fonts = {
  ...fontFamilies,
  text: `${fontFamilies.latin}, ${fontFamilies.music}, ${fontFamilies.cjk}`,
  title: `${fontFamilies.cjk}, ${fontFamilies.latin}, ${fontFamilies.music}`,
  titleWeight: 400, textWeight: 500, regularWeight: 400, boldWeight: 700,
  // Large-em glyph measurement avoids pixel rounding of small music symbols.
  measurementSize: 1000,
} as const

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
  // Fixed design-px geometry shared by reservation, ink and SVG painting.
  defaultPageMargin: 32, minimumWidth: 320, minimumContentWidth: 40,
  sustainHalfWidth: 4.62, sustainStroke: 2.2,
  dotFirstOffset: 4.29, dotStep: 5.94, dotRadius: 1.65, defaultDotRadius: 1.6,
  headerWrapInset: 2, voltaClearance: 2, minimumMeterStroke: 1,
  frameStroke: 1, arpeggioReferenceHeight: 10,
  navigationGap: 4.4, spacingReference: 12, quarterClearance: 6,
  openingBarFallbackInset: 2, closingBarFallbackInset: 3,
  arcHeight: 11, arcFullHeightSpan: 55,
  tieHeight: 7.2, tieFullHeightSpan: 72, tieThicknessRatio: 0.065,
  brokenSlurMaximumHeight: 17.6, brokenSlurMinimumHeight: 4.4,
  brokenSlurHeightFactor: 0.44,
  sharedScoreGap: 22, minimumTupletStroke: 1,
}

/** Native staff music and text share the same typography policy. */
const staffScale = 0.7
const staffSpace = 10
const staff = {
  title: 32, subtitle: 16, credit: 14, text: 16,
  annotation: 16, annotationLineHeight: 20,
  tempo: 15, chord: 14, dynamic: 16, fingering: 13,
  restCount: 16, measureNumber: 12, navigation: 14, volta: 12,
  expression: 14, octave: 13,
  // All font sizes are final logical score px, including native music glyphs.
  music: 40 * staffScale, graceNote: 26 * staffScale,
  tempoMusic: 32 * staffScale, arpeggio: 28 * staffScale,
  tuplet: 16 * staffScale,
  minimumCoreGap: 28, maximumCoreGap: 32,
  headerRowGap: 5, headerSideGap: 14, headerBottomGap: 7,
  headerWrapInset: 2, orderTopGap: 12, orderItemGap: 4,
  orderArrowWidth: 14, orderArrowHeight: 10, orderArrowTip: 4, orderArrowAdvance: 20,
  orderFramePadding: 4, frameStroke: 1,
  sectionLabelInset: 21, contentEdgeInset: 4, attachmentGap: 6, attachmentWrapInset: 12,
  tupletClearance: 3, lyricUnderlineHalfWidth: 0.5,
  measureNumberPadding: 2, measureNumberBarGap: 2, attachmentRowTolerance: 10,
  attachmentStandaloneGap: 12, attachmentHorizontalGap: 3.5, attachmentFramePadding: 4, repeatMarkGap: 4,
  endingClearance: 2, headingLeftInset: 0.5, edgeGap: 2, sectionGap: 12, pageInset: 2,
  minimumWidth: 320, minimumContentWidth: 80, bassGutter: 14, singleGutter: 1, rightGutter: 1,
  // Native engine coordinates before the uniform staffScale transform.
  // These are design px, not font em values or browser CSS pixels.
  engine: {
    scale: staffScale, staffSpace, halfSpace: staffSpace / 2,
    top: staffSpace * 4, middle: staffSpace * 6, bottom: staffSpace * 8,
    bassY: 140, initialBassY: 130, lineStroke: 1,
    fragmentSafetyInset: 20, spacingUnit: 22, minimumMeasureWidth: 40, measureEndGap: 8,
    signatureGap: 6, keyAccidentalGap: 3, clefGap: 10,
    headOverlap: 1, accidentalGap: 3, graceGap: 5,
    dotGap: 3, dotStep: 5, markGap: 5, markTopGap: 10, arpeggioWidth: 12,
    repeatEndInset: 18, finalEndInset: 7, doubleEndInset: 4,
    interludeWidth: 59, minimumRestWidth: 43, restPadding: 16,
    doubleBarGap: 3, finalThinOffset: 5, thickBarOffset: 1, thickBarStroke: 3,
    repeatThinOffset: 6, repeatDotOffset: 12, repeatDotCenter: 1.5,
    stemInset: 0.6, stemRootInset: 1, stemStroke: 1.2, graceStemStroke: 1,
    ledgerOverhang: 3, flagStemStep: 5, stemMarkGap: 6,
    arpeggioInset: 2, arpeggioVerticalGap: 5,
    graceSlashLeft: 4, graceSlashRight: 7, graceSlashTop: 15, graceSlashBottom: 5,
    beamStep: 7, beamThickness: 4, beamStubLength: 10,
    tupletBelow: 105, tupletAbove: 25, tupletBelowGap: 18, tupletAboveGap: 12,
    tupletLineOffset: 5, tupletHook: 5, tupletTextGap: 3,
    tieHeadGap: 1, tieVerticalGap: 6, tieMinimumHeight: 6, tieMaximumHeight: 16, tieThickness: 1.5,
    tempoHeadY: -30, tempoStemX: 9, tempoStemY: -31, tempoStemLength: 24, tempoStemStroke: 1.3,
    tempoFlagY: -55, tempoDotX: 16, tempoDotRadius: 1.8,
    tempoTextX: 18, tempoDottedTextX: 25, tempoTextY: -28,
    lyricInitialOffset: 30, lyricUnderlineOffset: 4, attachmentTopGap: 40, dynamicBottomGap: 35,
    navigationBarInset: 15, navigationY: -10, restHalfWidth: 20, restHook: 8, restStroke: 3,
    restCountGap: 2, measureNumberOffset: 10, braceX: -12, braceReferenceHeight: 39.88,
    endingBarInset: 3, endingTop: 5, endingBottom: 17, endingTextInset: 4, endingTextY: 22,
    relationStartInset: 2, slurHeight: 14, slurTopGap: 15, slurThickness: 2, slurInkSlice: 4,
    expressionBottomGap: 30, hairpinBottomGap: 25, hairpinMinimumWidth: 4, hairpinHalfHeight: 5,
    octaveAboveGap: 40, octaveBelowGap: 35, octaveTextWidth: 25, octaveLineOffset: 4,
    octaveHook: 8, octaveDash: 4, octaveDashGap: 3, expressionTopGap: 25,
    bassAdjustmentGap: 5,
  },
}

// 图片导出页脚：保留随谱宽缩放的现有行为。
const imageExport = { footerMinimumFontSize: 12, footerFontSizeWidthRatio: 0.02, marginRatio: 0.06, footerMarginRatio: 1.55 } as const
const rendering = { offscreenPosition: -20000, auditOffscreenPosition: -100000, previewPageGap: 16 } as const
const scorebook = {
  sharedScoreGap: 32,
  coverTitle: 40, coverWebsite: 18, contentsTitle: 30, sectionTitle: 16, entryTitle: 16, pageNumber: 14,
  coverTitleY: 350, coverWebsiteY: 410, contentsLeft: 40, contentsTop: 65,
  columnStep: 377, contentsRowsTop: 120, pageNumberOffset: 337,
} as const

// 页面宽度 1–9 档：24px 的 24–32 倍；合页在 28 倍（第 5 档）检查准入。
const pageWidth = {
  unit: numbered.music,
  minimumMultiple: 24,
  maximumMultiple: 32,
  sharedMaximumMultiple: 28,
  defaultMultiple: 30,
  // 页面手动滑条范围，独立于自动搜索的九档。
  manualMinimumMultiple: 20,
  manualMaximumMultiple: 40,
} as const

export const scoreLayoutConfig = { fonts, numbered, lyrics, staff, imageExport, rendering, scorebook, pageWidth }

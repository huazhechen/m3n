import type { FontFamily, NumberStyle } from './types.js'

export type NumberedNotationLayout = {
  width: number
  height: number
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  titleFont: FontFamily
  lyricFont: FontFamily
  numberStyle: NumberStyle
  titleSize: number
  subtitleSize: number
  authorSize: number
  tempoSize: number
  lyricSize: number
  bodyMarginTop: number
  musicToLyric: number
  lyricToLyric: number
  lineGap: number
  voiceGap: number
  musicFontCss?: string
}

export type NumberedNotationLayoutOptions = {
  width: number
  height: number
  musicFontCss?: string
}

const defaults = {
  margin: 48,
  titleFont: 'Microsoft YaHei' as FontFamily,
  lyricFont: 'serif' as FontFamily,
  numberStyle: 'b' as NumberStyle,
  titleSize: 32,
  subtitleSize: 16,
  authorSize: 14,
  tempoSize: 16,
  lyricSize: 16,
  bodyMarginTop: 24,
  musicToLyric: 12,
  lyricToLyric: 6,
  lineGap: 24,
  voiceGap: 0,
}

export function createNumberedNotationLayout({
  width,
  height,
  musicFontCss,
}: NumberedNotationLayoutOptions): NumberedNotationLayout {
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    marginTop: defaults.margin,
    marginBottom: defaults.margin,
    marginLeft: defaults.margin,
    marginRight: defaults.margin,
    titleFont: defaults.titleFont,
    lyricFont: defaults.lyricFont,
    numberStyle: defaults.numberStyle,
    titleSize: defaults.titleSize,
    subtitleSize: defaults.subtitleSize,
    authorSize: defaults.authorSize,
    tempoSize: defaults.tempoSize,
    lyricSize: defaults.lyricSize,
    bodyMarginTop: defaults.bodyMarginTop,
    musicToLyric: defaults.musicToLyric,
    lyricToLyric: defaults.lyricToLyric,
    lineGap: defaults.lineGap,
    voiceGap: defaults.voiceGap,
    musicFontCss,
  }
}

export function pageSpacing(layout: NumberedNotationLayout) {
  return {
    musicToLyric: layout.musicToLyric,
    lyricToLyric: layout.lyricToLyric,
    lineGap: layout.lineGap,
    voiceGap: layout.voiceGap,
  }
}

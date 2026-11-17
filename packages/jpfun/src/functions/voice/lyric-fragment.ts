import type { TextMeasurer, TextStyle } from '../../render/types.js';

export const lyricSilentPunctuation = new Set("（([［｛〈《「『【〔〖〘〚‘“，。！？；：、,.!?;:）)]］｝〉》」』】〕〗〙〛’”\"'…—–");
function parts(text: string) {
    let start = 0, end = text.length;
    while (start < end && lyricSilentPunctuation.has(text[start])) start++;
    while (end > start && lyricSilentPunctuation.has(text[end - 1])) end--;
    return { prefix: text.slice(0, start), body: text.slice(start, end) };
}

/** Baseline-relative paint geometry. Text origin and ink edge need not coincide. */
export type LyricPiece = {
    text: string;
    origin: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
    underline?: { left: number; right: number; y: number; stroke: number };
};

/** One measured fragment supplies both horizontal reservation and painting. */
export function measureLyricFragment(text: string, annotation: string | undefined, underlined: boolean,
    style: TextStyle, measurer: TextMeasurer) {
    const measure = (value: string) => measurer.measureText(value, style);
    const advance = (value: string) => {
        if (!value) return 0;
        const m = measure(value);
        return m.advance ?? m.w;
    };
    const { prefix, body } = parts(text);
    const half = advance(body) / 2;
    const logicalLeft = -half - advance(prefix);
    const origin = logicalLeft - (body ? measure(body).centerOffset ?? 0 : 0);
    const metrics = measure(text);
    const piece = (value: string, x: number): LyricPiece => {
        const m = measure(value);
        return { text: value, origin: x, left: x + (m.inkLeft ?? 0), right: x + (m.inkRight ?? m.w),
            top: -m.baseline, bottom: m.h - m.baseline };
    };
    const lyric = piece(text, origin);
    if (underlined) {
        const stroke = style.fontSize * (0.8 / 18.04);
        const y = metrics.h - metrics.baseline + style.fontSize * 0.1 + stroke / 2;
        lyric.underline = { left: lyric.left, right: lyric.right, y, stroke };
        lyric.left -= stroke / 2;
        lyric.right += stroke / 2;
        lyric.bottom = y + stroke / 2;
    }
    const label = annotation ? piece(annotation, origin - style.fontSize * 0.2 - advance(annotation)) : undefined;
    return { lyric, label,
        // Font side bearings remain natural space even when contours are narrow.
        left: Math.min(lyric.left, logicalLeft - (annotation ? style.fontSize * 0.2 + advance(annotation) : 0), label?.left ?? Infinity),
        right: Math.max(lyric.right, logicalLeft + advance(text), label?.right ?? -Infinity),
        // Hanging punctuation is still painted, but only the spoken body reserves a column.
        bodyHalf: half,
    };
}

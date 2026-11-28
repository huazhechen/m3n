// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation';
import { expect,it } from 'vitest';
import { NumberedNotationScore } from './index.js';
import { nativeSvgInk } from './native-ink.js';
import { layoutNativeScore } from './native-layout.js';
import { nativeLyricSvg,placeNativeLyrics } from './native-lyrics.js';
import { DefaultTextMeasurer } from './native-measure.js';
import { nativeAttachmentGap } from './native-style.js';
const source = '{2/4}\nN: 1 2 |\nL1: 甲乙\n---\nN: 3 4 |||\nL2: 丙丁\nL3: 戊己';
it('preserves empty verse slots across wrapping without adding a blank lyric tier', () => {
    const joined = '{2/4}\nN: ||: 1 2 |\nL1: 甲乙\nL2: 丙丁\n---\nN: 3 4 :|||\nL1: 戊己\nL2: %%';
    const wrapped = joined.replace('N: 3 4', 'N: {br}3 4');
    const roots = [joined, wrapped].map(text => new DOMParser().parseFromString(NumberedNotationScore.create(parseM3NDocument(text)).render({ width: 800, paged: false }).join(''), 'text/html'));
    const slots = (root: Document) => [...root.querySelectorAll('g[data-m3n-role="lyric-fragment"]')].map(node => [
        node.getAttribute('data-m3n-id'), node.getAttribute('data-m3n-rendition'), node.getAttribute('data-m3n-passes'), node.textContent,
    ]);
    expect(roots[0]!.querySelectorAll('g.system')).toHaveLength(1);
    expect(roots[1]!.querySelectorAll('g.system')).toHaveLength(2);
    expect(slots(roots[1]!)).toEqual(slots(roots[0]!));
    expect(roots[1]!.querySelectorAll('text[data-m3n-role="lyric"]')).toHaveLength(6);
    for (const id of ['m3n-e-3', 'm3n-e-4']) {
        const empty = roots[1]!.querySelector(`g[data-m3n-role="lyric-fragment"][data-m3n-id="${id}"][data-m3n-rendition="2"]`)!;
        expect(empty.getAttribute('data-m3n-passes')).toBe('2');
        expect(empty.childElementCount).toBe(0);
    }
    const layout = layoutNativeScore(parseM3NDocument(wrapped), { width: 800, paged: false });
    for (const glyph of layout.projection.glyphs.slice(2)) expect(glyph.lyricBaselines!.get(1)).toBe(glyph.lyricBaselines!.get(0));
});
it.each([320, 600, 800, 1000])('packs absent lyric rows locally in the native engine at width %s', width => {
    for (const paged of [false, true])
        for (const Engine of [NumberedNotationScore]) {
            const score = Engine.create(parseM3NDocument(source));
            const root = new DOMParser().parseFromString(score.render({ width, paged }).join(''), 'text/html');
            expect(root.querySelectorAll('g.system')).toHaveLength(1);
            const syllable = (text: string) => [...root.querySelectorAll('text[data-m3n-role="lyric"]')].find(node => node.textContent === text)!;
            expect(syllable('丙').getAttribute('data-m3n-rendition')).toBe('2');
            expect(syllable('戊').getAttribute('data-m3n-rendition')).toBe('3');
            expect(Number(syllable('丙').getAttribute('y'))).toBeCloseTo(Number(syllable('甲').getAttribute('y')), 3);
            expect(Number(syllable('戊').getAttribute('y'))).toBeGreaterThan(Number(syllable('丙').getAttribute('y')));
        }
});
it('distinguishes an absent verse from an explicit zero-width alignment token', () => {
    const measurer = new DefaultTextMeasurer();
    const layout = layoutNativeScore(parseM3NDocument(source), { width: 800, paged: false, textMeasurer: measurer });
    const system = layout.systems[0]!, lane = system.lanes[0]!;
    const first = layout.projection.glyphs[0]!, next = layout.projection.glyphs[2]!;
    const compactBottom = lane.bottom;
    expect(next.lyricBaselines!.get(1)).toBe(first.lyricBaselines!.get(0));
    next.lyrics.set(0, { texts: ['\u200B'], passes: new Set([1]) });
    const metadata = [...next.lyrics].map(([row, data]) => [row, data.texts, [...(data.passes ?? [])]]);
    placeNativeLyrics(system, lane, measurer);
    expect(next.lyricBaselines!.get(1)).toBeGreaterThan(first.lyricBaselines!.get(0)!);
    expect(lane.bottom).toBeGreaterThan(compactBottom);
    expect([...next.lyrics].map(([row, data]) => [row, data.texts, [...(data.passes ?? [])]])).toEqual(metadata);
    next.lyrics.set(0, { texts: [], passes: new Set([1]) });
    placeNativeLyrics(system, lane, measurer);
    expect(next.lyricBaselines!.get(1)).toBeGreaterThan(first.lyricBaselines!.get(0)!);
    next.lyrics.delete(0);
    placeNativeLyrics(system, lane, measurer);
    expect(next.lyricBaselines!.get(1)).toBe(first.lyricBaselines!.get(0));
    expect(lane.bottom).toBe(compactBottom);
});
it('aligns the first available verse in adjacent repeat endings without renumbering it', () => {
    const endings = '{2/4}\nN: ||: 1 2 |\nL1: 甲乙\n---V1\nN: 3 4 :||\nL1: 丙丁\n---V2,V3\nN: 5 6 |||\nL2: 戊己\nL3: 庚辛';
    for (const Engine of [NumberedNotationScore]) {
        const root = new DOMParser().parseFromString(Engine.create(parseM3NDocument(endings)).render({ width: 1000, paged: false }).join(''), 'text/html');
        expect(root.querySelectorAll('g.system')).toHaveLength(1);
        const first = root.querySelector('text[data-m3n-role="lyric"][data-m3n-rendition="1"]')!;
        const second = root.querySelector('text[data-m3n-role="lyric"][data-m3n-rendition="2"]')!;
        expect(Number(second.getAttribute('y'))).toBeCloseTo(Number(first.getAttribute('y')), 3);
        expect(second.getAttribute('data-m3n-passes')).toBe('2');
    }
});
it('measures packed tiers including underlines and font descenders', () => {
    const measurer = { measureText(text: string, style: {
            fontSize: number;
        }) {
            return { w: [...text].length * style.fontSize * .6, h: style.fontSize * (text === '戊' ? 1.3 : 1), baseline: style.fontSize * .7 };
        } };
    const layout = layoutNativeScore(parseM3NDocument(source), { width: 800, paged: false, textMeasurer: measurer });
    const system = layout.systems[0]!, lane = system.lanes[0]!, glyph = layout.projection.glyphs[2]!;
    glyph.lyrics.get(1)!.underlined = true;
    placeNativeLyrics(system, lane, measurer);
    const boxes = [1, 2].map(row => nativeSvgInk(nativeLyricSvg(glyph, row, glyph.lyricBaselines!.get(row)!, system.index, measurer), measurer));
    expect(boxes[1]!.top - boxes[0]!.bottom).toBeCloseTo(nativeAttachmentGap(), 3);
    expect(lane.bottom).toBeGreaterThanOrEqual(boxes[1]!.bottom - .001);
});

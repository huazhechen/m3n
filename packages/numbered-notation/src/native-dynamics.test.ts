// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation';
import { describe,expect,it } from 'vitest';
import { nativeDynamicGlyph } from './native-dynamics.js';
import { nativeSvgInk } from './native-ink.js';
import { layoutNativeScore } from './native-layout.js';
import { DefaultTextMeasurer } from './native-measure.js';
import { nativeStyle } from './native-style.js';
import { NativeSymbols } from './native-symbols.js';
const measurer = new DefaultTextMeasurer();
const names = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'] as const;
describe('native dynamic characters', () => {
    it.each(names)('preserves every %s contour and its measured dimensions', name => {
        const svg = new NativeSymbols(measurer).rawMark(name);
        expect(svg).toContain('<text');
        const root = new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml');
        expect(root.querySelectorAll('text[font-family="Bravura"]').length).toBeGreaterThan(0);
        const ink = nativeSvgInk(svg, measurer);
        expect(ink.left + ink.right).toBeCloseTo(0, 4);
    });
    it('measures dynamics using Bravura characters', () => {
        const painter = new NativeSymbols({ measureText(text, style) { expect(style.fontFamily).toBe('Bravura'); return measurer.measureText(text,style); } });
        for (const name of names)
            expect(painter.rawMark(name)).toContain('<text');
    });
    it('scales every dynamic from the same measured outline at each music size', () => {
        for (const name of names) {
            const original = nativeDynamicGlyph(name, 12)!;
            for (const size of [6, 12, 24]) {
                const glyph = nativeDynamicGlyph(name, size)!;
                const ink = nativeSvgInk(glyph.svg, measurer);
                expect(glyph.width).toBeCloseTo(original.width * size / 12, 5);
                expect(ink.right - ink.left).toBeCloseTo(glyph.width, 5);
                expect(ink.bottom - ink.top).toBeCloseTo(glyph.height, 5);
                expect(ink.left + ink.right).toBeCloseTo(0, 5);
                expect(glyph.height).toBeCloseTo(size * (name.includes('f') ? 1 : .79341), 5);
            }
        }
    });
    it('leaves non-dynamic marks to their own renderers', () => {
        for (const name of ['f1', 'tr', 'pppp', 'forte'])
            expect(nativeDynamicGlyph(name)).toBeUndefined();
    });
    it('uses a filled Bravura glyph for sfz', () => {
        const svg = new NativeSymbols(measurer).rawMark('sfz');
        expect(svg).toContain('<text');
        expect(svg).toContain('<text');
        expect(svg).not.toContain('font-style="italic"');
    });
    it.each([320, 800])('keeps measured dynamic ink outside a tuplet and below its reserved system top at %s', width => {
        for (const name of names)
            for (const paged of [false, true]) {
                const score = layoutNativeScore(parseM3NDocument(`{4/4}\nN: {${name}} ([12b3=:2]) 4 5 6 |||`), { width, paged });
                const system = score.systems[0]!, relation = system.relations.find(item => item.kind === 'tuplet')!;
                const glyph = relation.first, mark = glyph.markLayout!.find(item => item.name === name)!;
                const ink = nativeSvgInk(new NativeSymbols(measurer).rawMark(name), measurer);
                expect(mark.height).toBeCloseTo(ink.bottom - ink.top, 4);
                expect(mark.top).toBeCloseTo(mark.y + ink.top, 4);
                expect(mark.top + mark.height).toBeLessThanOrEqual(system.relationLayout!.get(relation)!.ink.top - nativeStyle.markGap + .0001);
                expect(system.lanes[0]!.top).toBeGreaterThanOrEqual(-mark.top - .0001);
            }
    });
});

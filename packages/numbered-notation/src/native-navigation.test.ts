import { parseM3NDocument } from '@m3n/notation';
import { describe,expect,it } from 'vitest';
import { measureNativeControl } from './native-controls.js';
import { nativePathInk,nativeSvgInk } from './native-ink.js';
import { layoutNativeScore } from './native-layout.js';
import type { TextMeasurer } from './native-measure.js';
import { nativeNavigationGlyph } from './native-navigation-glyphs.js';
import { measureNativeNavigation } from './native-navigation.js';
import { NativeSymbols } from './native-symbols.js';
// The music's measured axis is -8px. Navigation has a different ascent/descent
// ratio, a left overhang and ink extending beyond its advance width.
const measurer: TextMeasurer = { measureText(text, style) {
        if (style.fontFamily === 'M3N Numbers')
            return { w: 12, h: 18, baseline: 17 };
        return { w: text.length * style.fontSize * 0.6, advance: 26, inkLeft: -2, inkRight: 30, h: 9, baseline: 6 };
    } };
describe('measured navigation geometry', () => {
    it.each(['fine'] as const)('centers %s on the measured music axis and contains its overhangs', name => {
        const mark = measureNativeNavigation(name, measurer), ink = nativeSvgInk(mark.svg, measurer);
        expect((ink.top + ink.bottom) / 2).toBeCloseTo(-8, 4);
        expect(ink.left).toBe(0);
        expect(ink.right).toBe(32);
        expect(mark.width).toBe(32);
        expect(mark.ink).toEqual(ink);
    });
    it.each(['fine'] as const)('keeps trailing advance space for %s without substituting it for ink height', name => {
        const advance: TextMeasurer = { measureText(text, style) {
                return { ...measurer.measureText(text, style), advance: 40 };
            } };
        const mark = measureNativeNavigation(name, advance);
        expect(mark.width).toBe(42);
        expect(mark.ink.right).toBe(32);
        expect((mark.ink.top + mark.ink.bottom) / 2).toBeCloseTo(-8, 4);
    });
    it.each(['ds', 'dc'] as const)('uses a filled, font-independent %s on the measured axis', name => {
        const mark = measureNativeNavigation(name, measurer);
        expect(mark.svg).toContain('<path');
        expect(mark.svg).not.toContain('<text');
        expect(mark.ink.left).toBeCloseTo(0, 5);
        expect(mark.ink.right).toBeCloseTo(mark.width, 5);
        expect(mark.ink.bottom - mark.ink.top).toBeCloseTo(14.4, 5);
        expect((mark.ink.top + mark.ink.bottom) / 2).toBeCloseTo(-8, 5);
        const differentText: TextMeasurer = { measureText(text, style) {
                return style.fontFamily === 'M3N Numbers' ? measurer.measureText(text, style) : { w: 90, h: 50, baseline: 40 };
            } };
        expect(measureNativeNavigation(name, differentText)).toEqual(mark);
    });
    it.each(['segno', 'ds', 'dc'] as const)('scales %s from actual curve bounds', name => {
        const small = nativeNavigationGlyph(name, 12), large = nativeNavigationGlyph(name, 24);
        const a = nativePathInk(small.path), b = nativePathInk(large.path);
        expect(a.left).toBeCloseTo(0, 5);
        expect(a.top).toBeCloseTo(0, 5);
        expect(a.bottom).toBeCloseTo(12, 5);
        expect(a.right).toBeCloseTo(small.width, 5);
        expect(b.right).toBeCloseTo(a.right * 2, 5);
        expect(b.bottom).toBeCloseTo(24, 5);
    });
    it('reserves the complete Segno outline and centers its anchor and ink', () => {
        const control = measureNativeControl('segno', '', measurer);
        const ink = nativeSvgInk(new NativeSymbols(measurer).control(control), measurer);
        expect(control.width).toBeCloseTo(14.04754509, 5);
        expect(ink.left).toBeCloseTo(0, 5);
        expect(ink.right).toBeCloseTo(control.width, 5);
        expect(control.anchor).toBeCloseTo(control.width / 2, 5);
        expect(ink.bottom - ink.top).toBeCloseTo(18.4, 5);
        expect((ink.top + ink.bottom) / 2).toBeCloseTo(-8, 4);
    });
    it.each([320, 800])('places all measured navigation fragments before their bar at %spx', width => {
        const source = '{4/4}\nN: ' + Array(6).fill('1 2 3 4 |').join(' ') + ' [135:h] 2 3 4 {fine}{ds} |||';
        const result = layoutNativeScore(parseM3NDocument(source), { width, paged: true, textMeasurer: measurer });
        const measure = result.projection.measures.at(-1)!, notes = measure.columns.flatMap(column => column.glyphs);
        const marks = measure.navigation!, first = marks[0]!, last = marks.at(-1)!;
        expect(marks.map(mark => mark.text)).toEqual(['Fine.', 'D.S.']);
        expect(first.x!).toBeGreaterThan(Math.max(...notes.map(note => note.x + note.musicRight!)));
        expect(first.x! + first.width).toBeLessThan(marks[1]!.x!);
        expect(last.x! + last.width).toBeLessThan(measure.barX!);
        const system = result.systems.find(system => system.measures.includes(measure))!;
        const fragments = system.decorationLayout!.filter(fragment => fragment.svg.includes('data-m3n-role="navigation"'));
        expect(fragments).toHaveLength(2);
        for (const fragment of fragments) {
            const ink = nativeSvgInk(fragment.svg, measurer);
            expect((ink.top + ink.bottom) / 2).toBeCloseTo(-8, 4);
            expect(ink.left).toBeGreaterThan(32);
            expect(ink.right).toBeLessThan(width - 32);
        }
    });
});

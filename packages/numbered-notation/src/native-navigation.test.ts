import { parseM3NDocument } from '@m3n/notation';
import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { measureNativeControl } from './native-controls.js';
import { nativeSvgInk } from './native-ink.js';
import { layoutNativeScore } from './native-layout.js';
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js';
import { nativeNavigationGlyph } from './native-navigation-glyphs.js';
import { measureNativeNavigation } from './native-navigation.js';
import { NativeSymbols } from './native-symbols.js';
import { nativeBarMetrics, nativeHorizontalSpacing, nativeMeasureBars, placeNativeHorizontal } from './native-horizontal.js';
import { projectNativeScore } from './native-model.js';
// The music's measured axis is -8px. Navigation has a different ascent/descent
// ratio, a left overhang and ink extending beyond its advance width.
const measurer: TextMeasurer = { measureText(text, style) {
        if (style.fontFamily === 'Bravura') return new DefaultTextMeasurer().measureText(text,style);
        if (style.fontFamily === 'Barlow Semi Condensed')
            return { w: 12, h: 18, baseline: 17 };
        return { w: text.length * style.fontSize * 0.6, advance: 26, inkLeft: -2, inkRight: 30, h: 9, baseline: 6 };
    } };
describe('measured navigation geometry', () => {
    it.each([false, true])('shares Flower Dance bars 26–27 while preserving D.S. clearance (equalMeasures=%s)', equalMeasures => {
        const source = readFileSync(new URL('../../../src/scores/flower_dance_01.m3n', import.meta.url), 'utf8');
        const projection = projectNativeScore(parseM3NDocument(source), {textMeasurer:measurer});
        const measures = projection.measures.slice(25, 27), exit = measures[0]!, entry = measures[1]!;
        const options = {equalMeasures, minimumNoteGap:9};
        for (const width of [0, 400]) {
            const minimum = nativeHorizontalSpacing(measures, options).minimumWidth;
            placeNativeHorizontal(measures, options, 0, minimum + width);
            expect(nativeMeasureBars(measures, 0).closing).toBeUndefined();
            expect(nativeMeasureBars(measures, 1).opening).toBe(true);
            expect(exit.barX).toBe(entry.openingBarX);
            const mark = exit.navigation![0]!;
            expect(mark.text).toBe('D.S.');
            expect(mark.x!).toBeGreaterThan(Math.max(...exit.columns.flatMap(column => column.glyphs).map(note => note.x + note.musicRight!)));
            expect(mark.x! + mark.width).toBeLessThan(entry.openingBarX! - nativeBarMetrics('rptstart').anchor);
        }
        // Wrapping restores the closing boundary and keeps D.S. on its original row.
        const minimum = nativeHorizontalSpacing([exit], options).minimumWidth;
        placeNativeHorizontal([exit], options, 0, minimum);
        expect(nativeMeasureBars([exit], 0).closing).toBe('dbl');
        expect(exit.navigation![0]!.x! + exit.navigation![0]!.width).toBeLessThan(exit.barX!);
        expect(nativeMeasureBars([entry], 0).opening).toBe(true);
        expect(projection.measures.at(-1)!.source.right).toBe('end');
    });
    it.each([320,600,800])('keeps Flower Dance Coda clear of its first sixteenth at %spx', width => {
        const source = readFileSync(new URL('../../../src/scores/flower_dance_01.m3n', import.meta.url), 'utf8');
        for (const equalMeasures of [false, true]) {
            const layout = layoutNativeScore(parseM3NDocument(source), {width,paged:false,equalMeasures,minimumNoteGap:9,textMeasurer:measurer});
            const note = layout.projection.glyphs.find(glyph => glyph.controls.some(control => control.kind === 'coda'))!;
            const control = note.controls.find(control => control.kind === 'coda')!;
            const rightInk = Math.max(...control.ink.map(ink => ink.right));
            const gap = note.x - note.musicLeft! - control.x! - rightInk;
            expect(gap).toBeGreaterThanOrEqual(6.6 - 1e-6);
        }
    });
    it.each(['segno', 'coda'] as const)('gives %s quarter-note clearance on both sides before justification', name => {
        for (const minimumNoteGap of [9, 15]) {
            const projection = projectNativeScore(parseM3NDocument(`{1/4}\nN: ||: {${name}}((1 2 3 4)) |||`), {textMeasurer:measurer});
            const options = {minimumNoteGap};
            const spacing = nativeHorizontalSpacing(projection.measures, options);
            placeNativeHorizontal(projection.measures, options, 0, spacing.minimumWidth);
            const measure = projection.measures[0]!, note = projection.glyphs[0]!;
            const control = note.controls.find(control => control.kind === name)!;
            const bar = nativeBarMetrics('rptstart');
            const barRight = measure.openingBarX! + bar.width - bar.anchor;
            expect(control.x! - barRight).toBeCloseTo(minimumNoteGap, 8);
            // The structural symbol is a quarter; the following sixteenth
            // contributes half of the logarithmic pair weight.
            expect(note.x - note.musicLeft! - control.x! - control.width).toBeCloseTo(minimumNoteGap * .25 ** .25, 8);
        }
    });
    it.each([false, true])('keeps Segno attached to the preceding bar under justification (equalMeasures=%s)', equalMeasures => {
        for (const opening of [false, true]) for (const minimumNoteGap of [9, 15]) {
            const source = opening ? '{2/4}\nN: ||: {segno}1 2 | 3 4 |||' : '{2/4}\nN: 1 2 | {segno}3 4 |||';
            const projection = projectNativeScore(parseM3NDocument(source), {textMeasurer:measurer});
            const options = {minimumNoteGap, equalMeasures};
            const minimum = nativeHorizontalSpacing(projection.measures, options).minimumWidth;
            for (const width of [minimum, minimum + 400]) {
                placeNativeHorizontal(projection.measures, options, 0, width);
                const note = projection.glyphs.find(glyph => glyph.controls.some(control => control.kind === 'segno'))!;
                const control = note.controls.find(control => control.kind === 'segno')!;
                const bar = nativeBarMetrics(opening ? 'rptstart' : 'single');
                const anchor = opening ? projection.measures[0]!.openingBarX! : projection.measures[0]!.barX!;
                expect(control.x! - (anchor + bar.width - bar.anchor)).toBeCloseTo(minimumNoteGap, 8);
                expect(note.x - note.musicLeft! - control.x! - control.width).toBeGreaterThanOrEqual(minimumNoteGap - 1e-6);
            }
        }
    });
    it.each(['fine','tocoda'] as const)('centers %s on the measured music axis and contains its overhangs', name => {
        const mark = measureNativeNavigation(name, measurer), ink = nativeSvgInk(mark.svg, measurer);
        expect((ink.top + ink.bottom) / 2).toBeCloseTo(-8, 4);
        expect(ink.left).toBe(0);
        expect(ink.right).toBe(32);
        expect(mark.width).toBe(32);
        expect(mark.ink).toEqual(ink);
    });
    it.each(['fine','tocoda'] as const)('keeps trailing advance space for %s without substituting it for ink height', name => {
        const advance: TextMeasurer = { measureText(text, style) {
                return { ...measurer.measureText(text, style), advance: 40 };
            } };
        const mark = measureNativeNavigation(name, advance);
        expect(mark.width).toBe(42);
        expect(mark.ink.right).toBe(32);
        expect((mark.ink.top + mark.ink.bottom) / 2).toBeCloseTo(-8, 4);
    });
    it.each(['ds', 'dc'] as const)('uses Barlow navigation text on the measured axis', name => {
        const mark = measureNativeNavigation(name, measurer);
        expect(mark.svg).toContain('<text');
        expect(mark.svg).toContain('Barlow Semi Condensed');
        expect(mark.svg).toContain('font-weight="500"');
        expect(mark.ink.left).toBeCloseTo(0, 5);
        expect(mark.ink.right).toBeLessThanOrEqual(mark.width);
        expect((mark.ink.top + mark.ink.bottom) / 2).toBeCloseTo(-8, 5);
    });
    it.each(['segno', 'coda'] as const)('scales %s from actual curve bounds', name => {
        const small = nativeNavigationGlyph(name, 12), large = nativeNavigationGlyph(name, 24);
        const a = nativeSvgInk(small.svg,new DefaultTextMeasurer()), b = nativeSvgInk(large.svg,new DefaultTextMeasurer());
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
        expect(control.width).toBeCloseTo(13.3374045801, 5);
        expect(ink.left).toBeCloseTo(0, 5);
        expect(ink.right).toBeCloseTo(control.width, 5);
        expect(control.anchor).toBeCloseTo(control.width / 2, 5);
        expect(ink.bottom - ink.top).toBeCloseTo(19.2, 5);
        expect((ink.top + ink.bottom) / 2).toBeCloseTo(-8, 4);
    });
    it.each([320,800])('measures Coda onset and To Coda exit without colliding with notes at %spx', width => {
        const source = '{2/4}\nN: ||: 1 2 | 3 4 {tocoda} |\n---\nN: 5 6 :||\n---\nN: {br}{coda}7 1e |||';
        const layout = layoutNativeScore(parseM3NDocument(source), {width,paged:true,textMeasurer:measurer});
        const exit = layout.projection.measures[1]!;
        expect(exit.navigation!.map(mark => mark.text)).toEqual(['To Coda']);
        expect(exit.navigation![0]!.x!).toBeGreaterThan(Math.max(...exit.columns.flatMap(column => column.glyphs).map(note => note.x + note.musicRight!)));
        const coda = layout.projection.glyphs.find(glyph => glyph.controls.some(control => control.kind === 'coda'))!;
        const control = coda.controls.find(control => control.kind === 'coda')!;
        const ink = nativeSvgInk(new NativeSymbols(measurer).control(control),measurer);
        expect(ink.left).toBeGreaterThanOrEqual(-1e-6);
        expect(ink.right).toBeLessThanOrEqual(control.width + 1e-6);
        expect(control.ink.length).toBeGreaterThan(1);
        expect(new NativeSymbols(measurer).control(control)).toContain('data-m3n-role="coda"');
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

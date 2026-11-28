import { parseM3NDocument } from '@m3n/notation';
import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { cacheNativeHorizontal, measureNativeHorizontal, nativeBarMetrics, nativeHorizontalSpacing, nativeUnitRhythmicGap, nativeRhythmicSpacing, placeNativeHorizontal, placeNativeCoreHorizontal, type NativeHorizontalTemplates } from './native-horizontal.js';
import { nativeLayoutQuality } from './native-quality.js'
import { layoutNativeScore } from './native-layout.js';
import type { TextMeasurer } from './native-measure.js';
import { cloneNativeProjection, projectNativeScore } from './native-model.js';
// Barlow advance widths with deterministic offline em-height estimates.
// inkBottom distinguishes that estimate's blank tail from a real descender.
// Ordinary prose is irrelevant to these examples' horizontal music positions.
const measurer: TextMeasurer = { measureText(text, style) { return { w: style.fontSize === 24 && text === '0' ? 11.154037475585938 * 24 / 22 : text.length * style.fontSize * 0.58, h: style.fontSize, baseline: style.fontSize * 0.8, inkBottom: style.fontSize * 0.8 }; } };
// Coordinate regressions use explicit fixed spacing; adaptive selection is tested separately.
// Deterministic coordinates below use a smaller minimum clearance.
// Other geometry regressions fix the compact 9px spacing.
const narrowSpacing = { minimumNoteGap: 6.6, minimumNoteGapFloor: 2.2 };
const layout = (source: string, width = 800, spacing = {}) => layoutNativeScore(parseM3NDocument(source), { width, paged: false, textMeasurer: measurer, minimumNoteGap: 9, ...spacing });
describe('native spacing and measured note envelopes', () => {
    it('reuses equal-cell solutions across widths without sharing placement targets', () => {
        const document = parseM3NDocument('{4/4}\nN: 1 2 3 4 | (5 6) 7 1 2 | 3 4 5 6 |||\nB: 1 - - - | 2 - - - | 3 - - - |||');
        const base = projectNativeScore(document, { textMeasurer: measurer });
        const templates: NativeHorizontalTemplates = new Map();
        for (const width of [640, 528, 768, 640]) {
            const options = { minimumNoteGap: 8, equalMeasures: true };
            const cached = cloneNativeProjection(base), plain = cloneNativeProjection(base);
            cacheNativeHorizontal(options, templates);
            expect(nativeHorizontalSpacing(cached.measures, options)).toEqual(nativeHorizontalSpacing(plain.measures, { ...options }));
            expect(nativeUnitRhythmicGap(cached.measures, options, width)).toBe(nativeUnitRhythmicGap(plain.measures, { ...options }, width));
            placeNativeHorizontal(cached.measures, options, 13, width);
            placeNativeHorizontal(plain.measures, { ...options }, 13, width);
            expect(cached.measures).toEqual(plain.measures);
            expect(base.glyphs.every(glyph => glyph.x === 0)).toBe(true);
        }
    });
    it('matches all four note centres and the flush final bar of an unadorned system', () => {
        const result = layout('{4/4}\nN: 1 2 3 4 |||', 800, narrowSpacing);
        const expected = [38.084020441228695, 219.4340204412287, 400.78402044122873, 582.1340204412287];
        result.projection.glyphs.forEach((glyph, index) => expect(glyph.x).toBeCloseTo(expected[index]!, 6));
        expect(result.projection.measures[0]!.barX).toBeCloseTo(762.7, 6);
        expect(result.projection.glyphs[0]!.y).toBeCloseTo(95.96, 6);
    });
    it('reserves dots for dotted values and gives a plain eighth no phantom dot space', () => {
        const result = layout('{4/4}\nN: (1 2) 3. (4) 5 |||');
        const [eighth, , dotted] = result.projection.glyphs;
        expect(eighth!.right).toBeCloseTo(6.084020441229, 6);
        expect(dotted!.right).toBeCloseTo(12.564020441229, 6);
    });
    it('reserves accidentals on the left of the number without widening its right edge', () => {
        const result = layout('{4/4}\nN: 1# 2 3 4 |||');
        const first = result.projection.glyphs[0]!;
        expect(first.left).toBeGreaterThan(6.084020441229);
        expect(first.right).toBeCloseTo(6.084020441229, 6);
    });
    it('fits stacked chord tones by their actual octave-dot envelopes', () => {
        const result = layout('{4/4}\nN: 1 2 3 4 |||\nB: [1d3d5d:h]^^ |||');
        const bass = result.projection.glyphs.find(glyph => glyph.staff === 'bass')!;
        bass.pitchOffsets!.forEach((offset, index) => expect(offset).toBeCloseTo([0, -28.56, -57.12][index]!, 6));
        const lanes = result.systems[0]!.lanes;
        expect(lanes[1]!.y - lanes[0]!.y).toBeCloseTo(102.12, 6);
    });
    it('weights cross-system tie coverage without cumulative row padding', () => {
        const result = layout(readFileSync(new URL('../../../src/scores/chong_er_fei_01.m3n', import.meta.url), 'utf8'), 600);
        const axes = result.systems.map(system => system.lanes[0]!.y);
        expect(axes).toHaveLength(4);
        for (const [index, gap] of [42.7260037051, 39, 39].entries())
            expect(axes[index + 1]! - axes[index]!).toBeCloseTo(gap, 1);
        expect(result.pages[0]!.height).toBeCloseTo(299.4334009944, 1);
    });
    it('counts the shared voice connector once when breaking 欢乐颂 at 600px', () => {
        const result = layout(readFileSync(new URL('../../../src/examples/huan_le_song.m3n', import.meta.url), 'utf8'), 600);
        expect(result.systems.map(system => system.measures.length)).toEqual([4, 4, 4, 5]);
    });
    it('counts the repeat opening once across a section boundary', () => {
        // Keep this regression independent of song edits that remove local repeats.
        const source = '{4/4}\nN: ' + Array(9).fill('(5 6) 6~ 6^ |').join(' ')
            + '\n---\nN: ||: 0 0 (0 3) (6 7) | (1e 3) (1e 7~) (7 6) (5 6~) |';
        const result = layout(source, 800, narrowSpacing);
        // The repeat opening is included once; sustain widths include both round caps.
        const boundary = result.projection.measures[8]!;
        expect(boundary.minimumEnd! - boundary.minimumStart!).toBeCloseTo(82.28674971797398, 5);
        const opening = result.projection.measures[9]!;
        expect(opening.minimumEnd! - opening.minimumStart!).toBeCloseTo(133.92525620634603, 5);
        expect(result.systems.map(system => system.measures.length)).toEqual([6, 5]);
    });
    it('balances dense bars and keeps equally scored short rows last in narrow 卡农', () => {
        const result = layout(readFileSync(new URL('../../../src/scores/canon_01.m3n', import.meta.url), 'utf8'), 320, narrowSpacing);
        // Full-width ending costs rebalance the earlier rows as well.
        expect(result.systems).toHaveLength(44);
        expect(result.systems.slice(-5).map(system => system.measures.map(measure => measure.index + 1)))
            .toEqual([[51], [52], [53, 54, 55], [56, 57, 58], [59, 60, 61]]);
    });
    it('lets wide lyrics share the minimum note clearance instead of accumulating it', () => {
        const textMeasurer: TextMeasurer = { measureText(text, style) {
                return { w: text === '0' ? 11.154 : [...text].length * 20, h: style.fontSize, baseline: style.fontSize * 0.8 };
            } };
        const measure = (count: number) => {
            const document = parseM3NDocument(`{4/4}\nN: ${Array(count).fill('1').join(' ')} |||\nL: ${Array(count).fill('(春风)').join(' ')}`);
            const projection = projectNativeScore(document, { textMeasurer });
            measureNativeHorizontal(projection.measures, { minimumNoteGap: 9 });
            return projection.measures[0]!;
        };
        const two = measure(2), three = measure(3);
        // Lyric ink and minimum music clearance occupy the same space.
        expect(three.minimum - two.minimum).toBeCloseTo(2 * (20 + 0.4 * 16 / 18.04 + 1), 5);
    });
    it.each(['before', 'after'])('measures each forced row independently of adjacent springs (%s break)', kind => {
        const phrase = '||: 1 2 3 4 | 5 6 7 1e :||';
        const document = parseM3NDocument(`{4/4}\nN: 1 2 3 4 | ${phrase}`);
        const measures = [...document.parts.values()][0]!.melody;
        if (kind === 'before')
            measures[1]!.breakBefore = true;
        else
            measures[0]!.breakAfter = true;
        const combined = layoutNativeScore(document, { width: 800, paged: false, textMeasurer: measurer, minimumNoteGap: 9 });
        const isolated = layout(`{4/4}\nN: ${phrase}`);
        for (const [index, expected] of isolated.projection.measures.entries()) {
            const actual = combined.projection.measures[index + 1]!;
            expect(actual.minimum).toBeCloseTo(expected.minimum, 8);
            expect(actual.minimumStart).toBeCloseTo(expected.minimumStart!, 8);
        }
    });
    it.each([320, 600, 700, 800])('keeps section frame clearance rigid at %ipx, including equal measures', width => {
        for (const equalMeasures of [false, true]) for (const next of ['repeat', 'key', 'note']) {
            const prefix = next === 'repeat' ? '||: ' : next === 'key' ? '{key=A} ' : '';
            const source = `{4/4}\nN: 1 2 3 4 |\n===Intro\nN: ${prefix}1 2 3 4 | 5 6 7 1e |`;
            const result = layout(source, width, { equalMeasures });
            const measure = result.projection.measures[1]!, first = measure.columns[0]!.glyphs[0]!;
            const heading = first.controls.find(control => control.kind === 'section')!;
            const key = first.controls.find(control => control.kind === 'key');
            const left = next === 'repeat' ? measure.openingBarX! - nativeBarMetrics('rptstart').anchor
                : next === 'key' ? key!.x! + Math.min(...key!.ink.map(ink => ink.left))
                : first.x - first.inkLeft!;
            expect(left - heading.x! - heading.width).toBeCloseTo(12, 8);
            // Minimum-width measurement must reserve the same rigid edge.
            const projection = projectNativeScore(parseM3NDocument(source), { textMeasurer: measurer });
            measureNativeHorizontal(projection.measures, { minimumNoteGap: 9 });
            expect(projection.measures[1]!.minimum).toBeCloseTo(measure.minimum, 8);
        }
    });
    it('keeps all Turkish March inline labels 12px from their following symbol', () => {
        const source = readFileSync(new URL('../../../src/scores/turkish_march_01.m3n', import.meta.url), 'utf8');
        for (const width of [600, 700, 800]) {
            const result = layout(source, width);
            const headings = result.projection.glyphs.flatMap(glyph => glyph.controls.filter(control => control.kind === 'section').map(control => ({ glyph, control })));
            expect(headings.map(({ control }) => control.text)).toEqual(['A', 'B', 'C', 'Coda']);
            for (const { glyph, control } of headings) {
                const measure = result.projection.measures.find(measure => measure.columns.some(column => column.glyphs.includes(glyph)))!;
                const key = glyph.controls.find(control => control.kind === 'key');
                const left = measure.openingBarX !== undefined ? measure.openingBarX - nativeBarMetrics('rptstart').anchor
                    : key ? key.x! + Math.min(...key.ink.map(ink => ink.left)) : glyph.x - glyph.inkLeft!;
                expect(left - control.x! - control.width).toBeCloseTo(12, 8);
            }
        }
    });
});

it('measures physical full-width clearance independently of the tier baseline and placement', () => {
  const source = '{4/4}\nN: 1 2 3 4 |||'
  const tight = layout(source, 600, { minimumNoteGap: 8 })
  const loose = layout(source, 600, { minimumNoteGap: 16 })
  const a = tight.systems[0]!, b = loose.systems[0]!
  const snapshot = tight.projection.glyphs.map(g => g.x)
  const gap = nativeUnitRhythmicGap(a.measures, tight.options, 500)!
  expect(gap).toBeCloseTo(nativeUnitRhythmicGap(b.measures, loose.options, 500)!, 8)
  expect(nativeUnitRhythmicGap(a.measures, tight.options, 600)!).toBeGreaterThan(gap)
  const samples = nativeRhythmicSpacing(a.measures, tight.options, 500).gaps
  expect(samples.length).toBeGreaterThan(1)
  expect(samples).toEqual(nativeRhythmicSpacing(b.measures, loose.options, 500).gaps.map(value => expect.closeTo(value, 8)))
  expect(tight.projection.glyphs.map(g => g.x)).toEqual(snapshot)
})

it('pools all interval costs across rows instead of averaging row means or row costs', () => {
  const result = layout('{4/4}\nN: 1 2 3 4 | {br} 5 6 7 1e |||', 600)
  expect(result.systems).toHaveLength(2)
  result.systems[0]!.rhythmicGaps = [8]
  result.systems[1]!.rhythmicGaps = [16, 20, 24]
  for (const system of result.systems) system.unitRhythmicGap = 18
  const quality = nativeLayoutQuality(result)
  expect(quality.spacingCrampedCost).toBeCloseTo(.25)
  expect(quality.spacingExpandedCost).toBe(0)
})

it.each([false,true])('rebinds cached control and note targets across widths, equal=%s',equalMeasures=>{
 const document=parseM3NDocument('{4/4}\nN: 1# 2 {key=G}3 4 | 5 6 7 1e |||\nB: 1d 2d 3d 4d | 5d 6d 7d 1 |||')
 const base=projectNativeScore(document,{textMeasurer:measurer}),templates:NativeHorizontalTemplates=new Map()
 for(const width of [528,648,768,552,648]){
  const options={minimumNoteGap:8,equalMeasures}
  const cached=cloneNativeProjection(base),fresh=cloneNativeProjection(base)
  cacheNativeHorizontal(options,templates)
  measureNativeHorizontal(cached.measures,options)
  measureNativeHorizontal(fresh.measures,{...options})
  expect(cached.measures).toEqual(fresh.measures)
  placeNativeHorizontal(cached.measures,options,12,width)
  placeNativeHorizontal(fresh.measures,{...options},12,width)
  expect(cached.measures).toEqual(fresh.measures)
  expect(base.glyphs.every(glyph=>glyph.x===0)).toBe(true)
 }
})

it.each([false,true])('core-bound placement matches full music coordinates without mutating template targets, equal=%s',equalMeasures=>{
  const source='{4/4}\nN: 1# 2 {key=G}3 4 | 5 6 7 1e |||\nB: 1d 2d 3d 4d | 5d 6d 7d 1 |||'
  for(const minimumNoteGap of [8,16]) {
    const base=projectNativeScore(parseM3NDocument(source),{textMeasurer:measurer})
    const templates:NativeHorizontalTemplates=new Map()
    const options={minimumNoteGap,equalMeasures}
    cacheNativeHorizontal(options,templates)
    const minimum=nativeHorizontalSpacing(base.measures,options).minimumWidth
    const unplaced=structuredClone(base)
    for(const width of [minimum,528,720,552]) {
      const fast=cloneNativeProjection(base),full=cloneNativeProjection(base)
      placeNativeCoreHorizontal(fast.measures,options,width)
      placeNativeHorizontal(full.measures,{...options},0,width)
      expect(fast.measures.map(measure=>measure.columns.map(column=>({x:column.x,glyphs:column.glyphs.map(glyph=>glyph.x)}))))
        .toEqual(full.measures.map(measure=>measure.columns.map(column=>({x:column.x,glyphs:column.glyphs.map(glyph=>glyph.x)}))))
      expect(base).toEqual(unplaced)
    }
  }
})

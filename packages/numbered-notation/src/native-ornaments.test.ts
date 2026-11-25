// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation';
import { expect,it } from 'vitest';
import { nativeSvgInk } from './native-ink.js';
import { layoutNativeScore } from './native-layout.js';
import { DefaultTextMeasurer,type TextMeasurer } from './native-measure.js';
import { nativeOrnamentSvg } from './native-ornaments.js';
import { nativeStyle } from './native-style.js';
import { renderNativePages } from './native-svg.js';
const fallback = new DefaultTextMeasurer();
const fontIndependent: TextMeasurer = { measureText(text, style) {
        if (text === 'tr' || text === 'prall')
            throw new Error('Ornaments must not depend on text fonts');
        return fallback.measureText(text, style);
    } };
it.each([['tr', 12], ['prall', 6.6]] as const)('draws a centered %s silhouette at the music scale without text or stroke bounds', (name, height) => {
    const svg = nativeOrnamentSvg(name)!;
    const ink = nativeSvgInk(svg, fontIndependent);
    expect(svg).not.toMatch(/<path|stroke=/);
    expect(svg).toContain('fill="#000"');
    expect(ink.left + ink.right).toBeCloseTo(0, 3);
    expect(ink.bottom - ink.top).toBeCloseTo(height, 3);
    expect(ink.right - ink.left).toBeGreaterThan(nativeStyle.music * .5);
});
it('leaves other marks to their own renderers', () => {
    for (const name of ['fermata', 'mordent', 'tr++', 'f', 'unknown'])
        expect(nativeOrnamentSvg(name)).toBeUndefined();
});
it.each([320, 600, 800, 1000])('measures ornament ink with legal note/chord hosts and clears the tuplet at %s', width => {
    for (const paged of [false, true]) {
        const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: {p}([1 2 3:2]) [1e 3e 5e:h]{tr}{prall} 5 6 | {br} 1{tr}{f} 2 3 4 |||'), { width, paged, textMeasurer: fontIndependent });
        const root = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html');
        expect(root.querySelectorAll('[data-m3n-mark="tr"] text')).toHaveLength(2);
        expect(root.querySelectorAll('[data-m3n-mark="prall"] text')).toHaveLength(1);
        const first = layout.projection.glyphs.find(g => g.markLayout?.some(m => m.name === 'p'))!;
        const dynamic = first.markLayout!.find(m => m.name === 'p')!;
        const system = layout.systems.find(s => s.measures.some(m => m.columns.some(c => c.glyphs.includes(first))))!;
        const tuplet = [...system.relationLayout!].find(([r]) => r.kind === 'tuplet')![1];
        expect(dynamic.top + dynamic.height).toBeLessThanOrEqual(tuplet.ink.top - nativeStyle.markGap + .001);
        for (const g of layout.projection.glyphs)
            for (const mark of g.markLayout ?? []) {
                if (!['tr', 'prall'].includes(mark.name))
                    continue;
                const ink = nativeSvgInk(nativeOrnamentSvg(mark.name)!, fontIndependent);
                expect(mark.top).toBeCloseTo(mark.y + ink.top, 3);
                expect(mark.height).toBeCloseTo(ink.bottom - ink.top, 3);
                expect(g.top).toBeGreaterThanOrEqual(-mark.top - .001);
            }
    }
});

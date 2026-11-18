// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation';
import { expect,it } from 'vitest';
import { nativeFermataSvg } from './native-fermata.js';
import { nativeSvgInk } from './native-ink.js';
import { layoutNativeScore } from './native-layout.js';
import { DefaultTextMeasurer } from './native-measure.js';
import { nativeStyle } from './native-style.js';
import { NativeSymbols } from './native-symbols.js';
it.each([6, 12, 24])('scales the complete fermata curves and dot at %s', size => {
    const svg = size === 12 ? new NativeSymbols(new DefaultTextMeasurer()).rawMark('fermata') : nativeFermataSvg(size);
    const ink = nativeSvgInk(svg, new DefaultTextMeasurer());
    const root = new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml');
    const path = root.querySelector('path')!, circle = root.querySelector('circle')!;
    expect(circle).not.toBeNull();
    expect(Number(circle.getAttribute('r'))).toBeGreaterThan(0);
    expect(ink.bottom - ink.top).toBeGreaterThan(size / 2);
    expect(path.getAttribute('stroke-linecap')).toBe('round');
    expect(path.getAttribute('stroke-linejoin')).toBe('round');
    expect(ink.left + ink.right).toBeCloseTo(0, 4);
});
it.each(['1{fermata}', '[1e3e5e:h]{fermata}', '1{ac(2e3e)}{fermata}'])('places the complete fermata ink with measured clearance: %s', music => {
    const layout = layoutNativeScore(parseM3NDocument(`{4/4}\nN: ${music} 2 3 4 |||`), { width: 800, paged: false });
    const glyph = layout.projection.glyphs.find(g => g.markLayout?.some(m => m.name === 'fermata'))!;
    const mark = glyph.markLayout!.find(m => m.name === 'fermata')!;
    const ink = nativeSvgInk(new NativeSymbols(new DefaultTextMeasurer()).rawMark('fermata'), new DefaultTextMeasurer());
    expect(mark.top).toBeCloseTo(mark.y + ink.top, 4);
    expect(mark.height).toBeCloseTo(ink.bottom - ink.top, 4);
    const left = (mark.x ?? 0) + mark.left, right = (mark.x ?? 0) + mark.right;
    const hostTop = Math.min(...glyph.musicInk!.filter(b => b.right > left && b.left < right).map(b => b.top));
    expect(mark.top + mark.height).toBeCloseTo(hostTop - nativeStyle.markGap, 4);
});

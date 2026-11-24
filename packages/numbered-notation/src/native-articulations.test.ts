// @vitest-environment jsdom
import { expect,it } from 'vitest';
import { nativeArticulationSvg } from './native-articulations.js';
import { nativeSvgInk } from './native-ink.js';
import { DefaultTextMeasurer } from './native-measure.js';
import { NativeSymbols } from './native-symbols.js';
it.each([['str', 'accent', 6], ['str', 'accent', 12], ['str', 'accent', 24], ['breath', 'breath', 5], ['breath', 'breath', 10], ['breath', 'breath', 20]] as const)('uses the complete Bravura %s outline', (mark, _name, size) => {
    const svg = (mark === 'str' && size === 12) || (mark === 'breath' && size === 10)
        ? new NativeSymbols(new DefaultTextMeasurer()).rawMark(mark) : nativeArticulationSvg(mark, size)!;
    const path = new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml').querySelector('text');
    expect(path).not.toBeNull();
    const outline = nativeSvgInk(svg,new DefaultTextMeasurer());
    expect(outline.bottom - outline.top).toBeCloseTo(size * (mark === 'str' ? 0.5 : 1), 5);
    expect(path!.getAttribute('data-m3n-font')).toBe('Bravura');
    expect(path!.getAttribute('fill')).toBe('#000');
    expect(svg).toContain('<text');
    const ink = nativeSvgInk(svg, new DefaultTextMeasurer());
    expect(ink.left + ink.right).toBeCloseTo(0, 5);
});
it('measures the breath with its music font', () => {
    const painter = new NativeSymbols({ measureText(text,style) { expect(style.fontFamily).toBe('Bravura'); return new DefaultTextMeasurer().measureText(text,style); } });
    expect(painter.rawMark('breath')).toContain('<text');
    expect(painter.rawMark('breath')).not.toContain('<path');
});

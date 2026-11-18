// @vitest-environment jsdom
import { expect,it } from 'vitest';
import { nativeArticulationSvg } from './native-articulations.js';
import { nativePathInk,nativeSvgInk } from './native-ink.js';
import { DefaultTextMeasurer } from './native-measure.js';
import { NativeSymbols } from './native-symbols.js';
it.each([['str', 'accent', 6], ['str', 'accent', 12], ['str', 'accent', 24], ['breath', 'breath', 5], ['breath', 'breath', 10], ['breath', 'breath', 20]] as const)('uses the complete project %s shape and scaled stroke', (mark, _name, size) => {
    const svg = (mark === 'str' && size === 12) || (mark === 'breath' && size === 10)
        ? new NativeSymbols(new DefaultTextMeasurer()).rawMark(mark) : nativeArticulationSvg(mark, size)!;
    const path = new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml').querySelector('path');
    expect(path).not.toBeNull();
    const outline = nativePathInk(path!.getAttribute('d')!);
    expect(outline.bottom - outline.top).toBeCloseTo(size * (mark === 'str' ? 0.5 : 1), 5);
    if (mark === 'str') {
        expect(path!.getAttribute('stroke-linecap')).toBe('round');
        expect(path!.getAttribute('stroke-linejoin')).toBe('round');
    }
    expect(svg).not.toContain('<text');
    const ink = nativeSvgInk(svg, new DefaultTextMeasurer());
    expect(ink.left + ink.right).toBeCloseTo(0, 5);
});
it('draws a breath independently of installed text fonts', () => {
    const painter = new NativeSymbols({ measureText() { throw new Error('music contour must not measure text'); } });
    expect(painter.rawMark('breath')).toContain('<path');
    expect(painter.rawMark('breath')).not.toContain('<text');
});

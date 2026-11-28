// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation';
import { describe,expect,it } from 'vitest';
import { layoutNativeScore } from './native-layout.js';
import { renderNativePages } from './native-svg.js';
const source = '{4/4}{120qpm}\nN: 1 2 3 4 | {segno}{key=G}{6/8}{60qpm}{rest=2} | 1 2 3 |||\nB: 1d^ 5d^ | {rest=2} | 1d 2d 3d |';
const variants = [{ width: 320, paged: false }, { width: 1000, paged: true }];
describe('multi-rest onset controls in the native renderer', () => {
    it.each(variants)('preserves onset settings and duration at width $width, paged=$paged', options => {
        const document = parseM3NDocument(source);
        const native = layoutNativeScore(document, options);
        const root = new DOMParser().parseFromString(renderNativePages(native).join(''), 'text/html');
        expect(root.querySelectorAll('[data-m3n-control="meter"]')).toHaveLength(2);
        expect(root.querySelector('[data-m3n-control="segno"]')).not.toBeNull();
    });
});

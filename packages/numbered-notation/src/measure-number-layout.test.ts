// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseM3NDocument } from '@m3n/notation';
import { NumberedNotationScore } from './index.js';
import { DefaultTextMeasurer, type TextMeasurer } from './native-measure.js';
import { nativeSvgInk } from './native-ink.js';
const settings = [320, 800].flatMap(width => [false, true].map(paged => ({ width, paged })));
describe('visible row-end measure numbers', () => {
    it.each(settings)('does not measure hidden interior labels at $width, paged=$paged', options => {
        const fallback = new DefaultTextMeasurer();
        let hiddenMeasurements = 0;
        const textMeasurer: TextMeasurer = { measureText(text, style) {
                if (style.fontSize === 10 && text === '1') {
                    hiddenMeasurements++;
                    return { w: 6, h: 80, baseline: 60 };
                }
                return fallback.measureText(text, style);
            } };
        const pages = NumberedNotationScore.create(parseM3NDocument('{4/4}\nN: {lg}1 2 3 4 | 5 6 7 1e{/} |')).render({ ...options, pageMargin: 11, textMeasurer, measureNumbers: true });
        const root = new DOMParser().parseFromString(pages.join(''), 'text/html');
        expect([...root.querySelectorAll('[data-m3n-role="measure-number"]')].map(node => node.textContent)).toEqual(['2']);
        expect(hiddenMeasurements).toBe(0);
    });
    it.each(settings)('centers the whole two-digit number on its visible bar at $width, paged=$paged', options => {
        const textMeasurer = new DefaultTextMeasurer();
        const source = '{4/4}\nN: ' + Array(12).fill('1 2 3 4 |').join(' ');
        const pages = NumberedNotationScore.create(parseM3NDocument(source)).render({ ...options, pageMargin: 11, textMeasurer, measureNumbers: true });
        const root = new DOMParser().parseFromString(pages.join(''), 'text/html');
        const label = [...root.querySelectorAll('[data-m3n-role="measure-number"]')].find(node => node.textContent === '12')!;
        expect(label).toBeDefined();
        const bar = [...label.closest('g.system')!.querySelectorAll('g.measure')].at(-1)!.querySelector('[data-m3n-role="bar"] rect')!;
        expect(bar).not.toBeNull();
        const ink = nativeSvgInk(label.outerHTML, textMeasurer);
        expect((ink.left + ink.right) / 2).toBeCloseTo(Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')) / 2, 4);
    });
});

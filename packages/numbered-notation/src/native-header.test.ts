// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation';
import { describe,expect,it } from 'vitest';
import { numberedHeadingLines } from './header-text.js';
import { nativeHeaderGeometry } from './native-header.js';
import { nativeSvgInk,nativeSvgPieces } from './native-ink.js';
import { nativeLanePieces } from './native-lanes.js';
import { layoutNativeScore } from './native-layout.js';
import { DefaultTextMeasurer } from './native-measure.js';
import { NativeNumberedNotationScore } from './native-score.js';
const measurer = new DefaultTextMeasurer();
const source = '{title=演奏顺序}{4/4}{order=A,B,C,B,D}\n===A\nN: 1 2 3 4 |\n===B\nN: 5 6 7 1e |\n===C\nN: 1 2 3 4 |\n===D\nN: 5 6 7 1e |||';
describe('header text blocks in the native implementation', () => {
    const characters = { measureText(text: string) { return { w: [...text].length }; } };
    it('resets line width at explicit newlines and preserves requested blank lines', () => {
        expect(numberedHeadingLines('AB\nCD', 4, 1, characters)).toEqual(['AB', 'CD']);
        expect(numberedHeadingLines('AB\r\n\r\nCD\n', 4, 1, characters)).toEqual(['AB', '', 'CD', '']);
    });
    it('does not strand a short first word when the following word needs hard wrapping', () => {
        expect(numberedHeadingLines('A BCDEFGHIJ', 6, 1, characters)).toEqual(['A BCDE', 'FGHIJ']);
    });

    it('keeps the configured title gap to side information and the smaller gap to a subtitle', () => {
        const withoutSubtitle = nativeHeaderGeometry(parseM3NDocument('{title=标题}{4/4}\nN: 1 2 3 4 |||'), 800, 32, measurer);
        expect(withoutSubtitle.sidesTop - withoutSubtitle.titleBottom).toBeCloseTo(22 * 0.8, 8);
        const withSubtitle = nativeHeaderGeometry(parseM3NDocument('{title=标题}{subtitle=副标题}{4/4}\nN: 1 2 3 4 |||'), 800, 32, measurer);
        expect(withSubtitle.sidesTop - withSubtitle.titleBottom).toBeCloseTo(22 * 0.8, 8);
        expect(withSubtitle.subtitleTop - withSubtitle.titleBottom).toBeCloseTo(22 * 0.4, 8);
    });

    it('accounts for measured order rows and configured gaps exactly once', () => {
        const document = parseM3NDocument(source), plain = { ...document, order: undefined };
        for (const gap of [12, 24, 36]) {
            const geometry = nativeHeaderGeometry(document, 320, 32, measurer, gap);
            const without = nativeHeaderGeometry(plain, 320, 32, measurer, gap);
            expect(geometry.orderRows).toHaveLength(2);
            expect(geometry.height - without.height).toBeCloseTo(2 * (23 + gap), 12);
            expect(geometry.orderRows[0]!.top - geometry.sidesBottom).toBeCloseTo(gap, 12);
            expect(geometry.orderRows[1]!.top - geometry.orderRows[0]!.top).toBeCloseTo(23 + gap, 12);
        }
        const empty = nativeHeaderGeometry({ ...document, order: ['', ''] }, 320, 32, measurer);
        expect(empty.orderRows).toEqual([]);
        expect(empty.height).toBe(nativeHeaderGeometry(plain, 320, 32, measurer).height);
    });
    it('paints every order label at its measured position and keeps the first music row below it', () => {
        const document = parseM3NDocument(source);
        const geometry = nativeHeaderGeometry(document, 320, 32, measurer);
        const pages = NativeNumberedNotationScore.create(document).render({ width: 320, paged: false });
        const root = new DOMParser().parseFromString(pages.join(''), 'text/html');
        const labels = [...root.querySelectorAll('[data-m3n-role="order"]')];
        const items = geometry.orderRows.flatMap(row => row.items.filter(item => item.framed));
        expect(labels.map(label => label.textContent)).toEqual(['A', 'B', 'C', 'B', 'D']);
        expect(root.querySelectorAll('path[data-m3n-role="order-arrow"]')).toHaveLength(4);
        expect([...root.querySelectorAll('text')].some(text => text.textContent === '→')).toBe(false);
        expect(labels.map(label => label.parentElement!.getAttribute('data-m3n-order-index'))).toEqual(['0', '1', '2', '3', '4']);
        expect(labels.every(label => label.parentElement!.querySelector('rect'))).toBe(true);
        labels.forEach((label, index) => {
            expect(Number(label.getAttribute('x'))).toBeCloseTo(items[index]!.x + 3.5, 4);
            expect(Number(label.getAttribute('y'))).toBeCloseTo(items[index]!.baseline, 4);
        });
        const score = layoutNativeScore(document, { width: 320, paged: false });
        const first = score.systems[0]!;
        const headerInk = nativeSvgPieces(score.pages[0]!.header!, score.measurer);
        const musicInk = nativeLanePieces(first, score.measurer).get(first.lanes[0]!.id)!;
        let checked = 0;
        for (const upper of headerInk)
            for (const lower of musicInk) {
                if (Math.min(upper.right, lower.right) <= Math.max(upper.left, lower.left))
                    continue;
                expect(first.lanes[0]!.y + lower.top - upper.bottom).toBeGreaterThanOrEqual(12 - 1e-6);
                checked++;
            }
        expect(checked).toBeGreaterThan(0);
    });
    it('adds a section gap between musical sections, without adding one after the header', () => {
        const layout = (source: string) => layoutNativeScore(parseM3NDocument(source), { width: 800, paged: false });
        const plain = layout('{4/4}\nN: 1 2 3 4 | {br} 5 6 7 1e |||');
        const sections = layout('{4/4}\n===A\nN: 1 2 3 4 |\n===B\nN: 5 6 7 1e |||');
        const stride = (score: ReturnType<typeof layout>) => score.systems[1]!.lanes[0]!.y - score.systems[0]!.lanes[0]!.y;
        expect(stride(sections) - stride(plain)).toBeCloseTo(12);
        // The first section has no extra 12px gap below the header. Its frame
        // changes the local ink clearance by only half a pixel.
        expect(Math.abs(sections.systems[0]!.lanes[0]!.y - plain.systems[0]!.lanes[0]!.y)).toBeLessThan(1);
    });
    it('preserves order-frame padding beyond measured left and right ink overhang', () => {
        const measured = { measureText() { return { w: 8.5, advance: 8.5, h: 11, baseline: 9, inkLeft: -3, inkRight: 13 }; } };
        const geometry = nativeHeaderGeometry(parseM3NDocument(source), 800, 32, measured);
        const item = geometry.orderRows[0]!.items.find(item => item.framed)!;
        const root = new DOMParser().parseFromString(geometry.svg, 'text/html');
        const text = root.querySelector('[data-m3n-role="order"]')!;
        const ink = nativeSvgInk(text.outerHTML, measured);
        expect(ink.left - item.x).toBeCloseTo(3.5, 4);
        expect(item.x + item.width - ink.right).toBeCloseTo(3.5, 4);
    });
});
it('places each right credit row with the shared five-design-pixel ink clearance', () => {
    const doc = { ...parseM3NDocument('{4/4}\nN: 1 2 3 4 |||'), lyricist: '甲', composer: '乙', origin: '来源' };
    const varied = { measureText(text: string, style: {
            fontSize: number;
        }) {
            return { w: text.length * style.fontSize, h: text.includes('作曲') ? 21 : 11, baseline: 8 };
        } };
    const geometry = nativeHeaderGeometry(doc, 800, 32, varied);
    const root = new DOMParser().parseFromString(`<svg>${geometry.svg}</svg>`, 'image/svg+xml');
    const credits = [...root.querySelectorAll('text[text-anchor="end"]')].map(text => {
        const ink = nativeSvgInk(text.outerHTML, varied);
        const y = Number(text.parentElement!.getAttribute('transform')!.match(/translate\(0 ([^)]+)\)/)![1]);
        return { top: ink.top + y, bottom: ink.bottom + y };
    });
    expect(credits).toHaveLength(3);
    for (let i = 1; i < credits.length; i++)
        expect(credits[i]!.top - credits[i - 1]!.bottom).toBeCloseTo(5, 4);
});
it('aligns range numerals and separator to the measured music axis', () => {
    const doc = parseM3NDocument('{4/4}\nN: 1 2 3 5 |||');
    const varied = { measureText(text: string, style: {
            fontSize: number;
        }) {
            const h = text === '~' ? 4 : style.fontSize * 0.7;
            return { w: text.length * style.fontSize * 0.6, h, baseline: text === '~' ? 7 : h * 0.9 };
        } };
    const geometry = nativeHeaderGeometry(doc, 800, 32, varied);
    const root = new DOMParser().parseFromString(`<svg>${geometry.svg}</svg>`, 'image/svg+xml');
    const parts = [...root.querySelector('[data-m3n-role="pitch-range"]')!.children];
    expect(parts).toHaveLength(4);
    expect(parts[0]!.textContent).toBe('音域：');
    const zero = varied.measureText('0', { fontSize: 22 }), axis = zero.h / 2 - zero.baseline;
    for (const part of parts) {
        const ink = nativeSvgInk(part.outerHTML, varied);
        expect((ink.top + ink.bottom) / 2).toBeCloseTo(axis, 4);
    }
});
it('reserves a complete numeral body for narrow range digits', () => {
    const varied = { measureText(text: string, style: {
            fontSize: number;
        }) {
            const advance = style.fontSize * 0.6 * text.length;
            const width = text === '1' ? advance / 3 : advance;
            return { w: advance, advance, inkLeft: 0, inkRight: width, h: style.fontSize * 0.7,
                baseline: style.fontSize * 0.7, centerOffset: (width - advance) / 2 };
        } };
    const separators = ['1', '2'].map(low => {
        const geometry = nativeHeaderGeometry(parseM3NDocument(`{2/4}\nN: ${low} 5 |||`), 800, 32, varied);
        const root = new DOMParser().parseFromString(`<svg>${geometry.svg}</svg>`, 'image/svg+xml');
        return root.querySelector('[data-m3n-role="pitch-range"]')!.children[2]!.getAttribute('transform');
    });
    expect(separators[0]).toBe(separators[1]);
});

// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation';
import { describe,expect,it } from 'vitest';
import { nativeHeaderGeometry } from './native-header.js';
import { nativeSvgInk } from './native-ink.js';
import { DefaultTextMeasurer } from './native-measure.js';
const plain = '{title=谱头}{4/4}\nN: 1 2 3 4 |||';
const measure = new DefaultTextMeasurer();
describe('measured header side arrangement in the native engine', () => {
    it.each([320, 599, 600, 800, 1000])('shares the top when content fits at %s', width => {
        const one = plain.replace('{4/4}', '{composer=甲}{4/4}');
        const many = plain.replace('{4/4}', '{lyricist=甲}{composer=乙}{4/4}');
        const native = [one, many].map(source => nativeHeaderGeometry(parseM3NDocument(source), width, 32, measure));
        expect(native[0]!.signaturesTop).toBeCloseTo(native[1]!.signaturesTop, 5);
        expect(native[1]!.signaturesTop).toBeCloseTo(native[1]!.creditsTop, 5);
    });
    it('clears only truly intersecting credit ink on wide pages', () => {
        const source = plain.replace('{4/4}', `{composer=甲${'很长的署名'.repeat(9)}}{120qpm}{4/4}`);
        const document = parseM3NDocument(source);
        const native = nativeHeaderGeometry(document, 800, 32, measure);
        expect(native.signaturesTop).toBeGreaterThan(native.creditsTop);
    });
    it('keeps origin width independent from other credit rows', () => {
        const roles = '{lyricist=甲}{composer=乙}{arranger=丙}{singer=丁}';
        const without = plain.replace('{4/4}', roles + '{4/4}');
        const withOrigin = plain.replace('{4/4}', roles + '{origin=这是一段非常长的曲调来源说明文字}{4/4}');
        const labels = [without, withOrigin].map(source => {
            const geometry = nativeHeaderGeometry(parseM3NDocument(source), 320, 32, measure);
            const root = new DOMParser().parseFromString(`<svg>${geometry.svg}</svg>`, 'text/html');
            return [...root.querySelectorAll('text')].find(text => text.textContent === '甲 作词')!;
        });
        expect(labels[0]!.getAttribute('x')).toBe(labels[1]!.getAttribute('x'));
    });
    it.each([320, 800])('shares the requested credit and subtitle policy at %s', width => {
        const document = parseM3NDocument('{title=曲名}{subtitle=原副标题}{singer=歌手}{lyricist=甲}{composer=乙}{arranger=丙}{origin=传统曲调}{4/4}\nN: 1 2 3 4 |||');
        const native = nativeHeaderGeometry(document, width, 32, measure);
        expect(native.subtitle).toEqual(['原副标题', '歌手 演唱']);
        const root = new DOMParser().parseFromString(`<svg>${native.svg}</svg>`, 'text/html');
        const nativeTexts = [...root.querySelectorAll('text')];
        for (const value of ['甲 作词', '乙 作曲', '传统曲调']) {
            const credit = nativeTexts.find(text => text.textContent === value)!;
            expect(credit.getAttribute('text-anchor')).toBe('end');
            expect(Number(credit.getAttribute('x'))).toBe(width - 32);
        }
        const singer = nativeTexts.find(text => text.textContent === '歌手 演唱')!;
        expect(singer.getAttribute('text-anchor')).toBe('middle');
        expect(Number(singer.getAttribute('x'))).toBe(width / 2);
        expect(nativeTexts.some(text => text.textContent?.includes('丙'))).toBe(false);
        expect(document.arranger).toBe('丙');
    });
});
describe('subtitle shares measured vertical space with the sides', () => {
    it('shares all three columns when they fit', () => {
        const source = '{title=标题}{subtitle=副标题}{singer=歌手}{composer=甲}{4/4}\nN: 1 2 3 4 |||';
        const native = nativeHeaderGeometry(parseM3NDocument(source), 1000, 32, measure);
        expect(native.subtitleTop).toBeCloseTo(native.titleBottom + 8.64, 4);
        expect(native.signaturesTop).toBeCloseTo(native.titleBottom + 17.28, 4);
        expect(native.creditsTop).toBeCloseTo(native.signaturesTop, 4);
    });
});
it('keeps 0.4em of ink clearance when the subtitle conflicts horizontally with left information', () => {
    const source = `{title=标题}{subtitle=${'很长的副标题'.repeat(12)}}{composer=作曲者}{4/4}\nN: 1 2 3 4 |||`;
    const native = nativeHeaderGeometry(parseM3NDocument(source), 320, 32, measure);
    const root = new DOMParser().parseFromString(`<svg>${native.svg}</svg>`, 'image/svg+xml');
    const subtitle = root.querySelector('[data-m3n-role="subtitle"]')!;
    const ink = nativeSvgInk(subtitle.outerHTML, measure);
    expect(native.signaturesTop).toBeGreaterThanOrEqual(ink.bottom + 8.64 - 1e-6);
});
it('keeps blank subtitle lines from creating invisible collision obstacles', () => {
    const source = '{title=标题}{composer=甲}{4/4}\nN: 1 2 3 4 |||';
    const document = { ...parseM3NDocument(source), subtitle: '\n' };
    const native = nativeHeaderGeometry(document, 240, 32, measure);
    const withoutSubtitle = nativeHeaderGeometry(parseM3NDocument(source), 240, 32, measure);
    expect(native.signaturesTop).toBeCloseTo(withoutSubtitle.signaturesTop, 4);
    expect(native.height).toBeCloseTo(withoutSubtitle.height, 4);
});

// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation';
import { describe,expect,it } from 'vitest';
import { NumberedNotationScore } from './index.js';
import { nativeArpeggioGeometry } from './native-arpeggio.js';
import { nativeSvgInk } from './native-ink.js';
import { layoutNativeScore } from './native-layout.js';
import { DefaultTextMeasurer,type TextMeasurer } from './native-measure.js';
import { NativeMusicPainter } from './native-music.js';
import { nativeStyle } from './native-style.js';
import { renderNativePages } from './native-svg.js';
const normal = new DefaultTextMeasurer();
const wide: TextMeasurer = { measureText(text, style) {
        const advance = text.length * style.fontSize * 0.9, overhang = style.fontSize * 0.2;
        return { w: advance + overhang, advance, h: style.fontSize * 1.1, baseline: style.fontSize * 0.7,
            inkLeft: -overhang, inkRight: advance, centerOffset: -overhang / 2 };
    } };
const source = (music: string) => `{4/4}\nN: ${music} |||`;
function checkGeometry(music: string, measurer: TextMeasurer) {
    const layout = layoutNativeScore(parseM3NDocument(source(music)), { width: 320, paged: false, textMeasurer: measurer });
    const painter = new NativeMusicPainter(measurer);
    const glyph = layout.projection.glyphs.find(glyph => glyph.arpeggioLayout)!;
    expect(glyph).toBeDefined();
    const local = { ...glyph, x: 0, y: 0 }, host = nativeSvgInk(painter.body(local), measurer);
    const wave = glyph.arpeggioLayout!.ink;
    expect(host.left - wave.right).toBeCloseTo(nativeStyle.music * 0.16, 3);
    expect(wave.top).toBeCloseTo(host.top, 3);
    expect(wave.bottom).toBeCloseTo(host.bottom, 3);
    const painted = nativeSvgInk(painter.body(local) + glyph.arpeggioLayout!.svg + (glyph.graceLayout?.svg ?? ''), measurer);
    expect(-painted.left).toBeLessThanOrEqual(glyph.musicLeft! + 0.0001);
    expect(painted.right).toBeLessThanOrEqual(glyph.musicRight! + 0.0001);
    expect(-painted.top).toBeLessThanOrEqual(glyph.musicTop! + 0.0001);
    expect(painted.bottom).toBeLessThanOrEqual(glyph.musicBottom! + 0.0001);
    if (glyph.graceLayout)
        expect(wave.left - glyph.graceLayout.ink.right).toBeGreaterThan(0);
    return { glyph, layout, painter };
}
describe('measured arpeggio engraving', () => {
    it.each(['[135:h]{arp}', '[1##3bb5e:h].{arp}', '[135:h]{arp}{ac(2e3e)}'])('fits complete chord ink for %s', music => {
        checkGeometry(music + ' 2 3 4', normal);
        checkGeometry(music + ' 2 3 4', wide);
    });
    it('moves and reserves the wave with actual font and accidental bounds', () => {
        const plain = checkGeometry('[135:h]{arp} 2 3 4', normal).glyph;
        const altered = checkGeometry('[1##3bb5:h]{arp} 2 3 4', normal).glyph;
        const changed = checkGeometry('[135:h]{arp} 2 3 4', wide).glyph;
        expect(altered.arpeggioLayout!.ink.right).toBeLessThan(plain.arpeggioLayout!.ink.right);
        expect(altered.musicLeft!).toBeGreaterThan(plain.musicLeft!);
        expect(changed.musicLeft!).toBeGreaterThan(plain.musicLeft!);
    });
    it.each([320, 600, 800, 1000].flatMap(width => [false, true].map(paged => ({ width, paged }))))('keeps combined grace, ornaments and arpeggio usable in the native engine at $width, paged=$paged', ({ width, paged }) => {
        const document = parseM3NDocument(source('1 [1##3bb5:h]{arp}{ac(2## 3bb)}{str}{tr}{p} 3 4'));
        const native = layoutNativeScore(document, { width, paged, textMeasurer: normal });
        const root = new DOMParser().parseFromString(renderNativePages(native).join(''), 'text/html');
        expect(root.querySelectorAll('[data-m3n-role="arpeggio"]')).toHaveLength(1);
        const glyph = native.projection.glyphs.find(glyph => glyph.arpeggioLayout)!;
        const publicRoot = new DOMParser().parseFromString(NumberedNotationScore.create(document).render({ width, paged }).join(''), 'text/html');
        const chord = publicRoot.getElementById(glyph.id)!;
        expect(chord).not.toBeNull();
        expect([...chord.querySelectorAll('text[font-size="24"]')].map(text => text.textContent)).toEqual(['1', '3', '5']);
        expect(glyph.x - glyph.musicLeft!).toBeGreaterThanOrEqual(32 - 0.0001);
        const preceding = native.projection.glyphs[0]!;
        if (glyph.y === preceding.y)
            expect(glyph.x - glyph.musicLeft!).toBeGreaterThan(preceding.x + preceding.musicRight!);
    });
    it('does not repeat the wave or its reserved width on sustain segments', () => {
        const { layout } = checkGeometry('[135:h]^^{arp}', normal);
        expect(layout.projection.glyphs.filter(glyph => glyph.arpeggioLayout)).toHaveLength(1);
        for (const glyph of layout.projection.glyphs.filter(glyph => glyph.sustain)) {
            expect(glyph.musicLeft!).toBeLessThan(nativeStyle.music / 2);
        }
        const root = new DOMParser().parseFromString(renderNativePages(layout).join(''), 'text/html');
        expect(root.querySelectorAll('[data-m3n-role="arpeggio"]')).toHaveLength(1);
    });
    it.each([23, 39.7, 90.2])('fits arbitrary measured chord heights without rounding the endpoint up: %s', height => {
        const geometry = nativeArpeggioGeometry({ left: -37.3, right: 6, top: -height + 4.2, bottom: 4.2 }, normal);
        expect(geometry.ink.top).toBeCloseTo(-height + 4.2, 3);
        expect(geometry.ink.bottom).toBeCloseTo(4.2, 3);
    });
});

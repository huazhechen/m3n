import { nativeSvgPieces } from './native-ink.js'
// @vitest-environment jsdom
import { parseM3NDocument } from '@m3n/notation';
import { describe,expect,it } from 'vitest';
import { layoutNativeScore } from './native-layout.js';
import type { TextMeasurer } from './native-measure.js';
import { nativeBeamLayout,NativeMusicPainter } from './native-music.js';
import { renderNativePages } from './native-svg.js';
const root = (svg: string) => new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml');
const measurer: TextMeasurer = { measureText: () => ({ w: 19, h: 16, baseline: 16 }) };
function glyphs(notes = '(1 (2 3)) 4 5 6', meter = '4/4') {
    return layoutNativeScore(parseM3NDocument(`{${meter}}\nN: ${notes} |||`), { width: 800, paged: false, textMeasurer: measurer }).projection.glyphs;
}
describe('measured reduction lines', () => {
    it.each(['{key=G}', '{90qpm}', '{2/4}'])('breaks reduction lines at an inline control: %s', control => {
        const notes = glyphs(`(1 ${control}2) 3 4`, '3/4').slice(0, 2);
        expect(notes[1]!.controls.length).toBeGreaterThan(0);
        const beams = nativeBeamLayout(notes, measurer);
        expect(beams.svg).toBe('');
        expect(beams.claimed.size).toBe(0);
        const painter = new NativeMusicPainter(measurer);
        for (const note of notes)
            expect(root(painter.music(note, beams.claimed.get(note))).querySelectorAll('line')).toHaveLength(1);
    });
    it('breaks both voices at a shared key while keeping each side connected', () => {
        const layout = layoutNativeScore(parseM3NDocument('{3/4}\nN: (1 {key=G}2) 3 4 |||\nB: ((1d 2d 3d 4d)) 5d 6d |'), { width: 800, paged: false, textMeasurer: measurer });
        const notes = layout.projection.glyphs.filter(glyph => glyph.lane === 'bass');
        const key = notes[2]!.controls.find(control => control.kind === 'key')!;
        expect(key).toBeDefined();
        const lines = [...root(nativeBeamLayout(notes, measurer).svg).querySelectorAll('line')];
        expect(lines).toHaveLength(4);
        for (const line of lines) {
            const left = Number(line.getAttribute('x1')), right = Number(line.getAttribute('x2'));
            expect(right <= key.x! || left >= key.x! + key.width).toBe(true);
        }
    });
    it.each([
        { source: '([1 2 3:1]) ((4 5)) 6', deeper: [3, 4] },
        { source: '((1 2)) ([3 4 5:1]) 6', deeper: [0, 1] },
        { source: '([1 2 3:1]) ([4 5 6:1]) 7', deeper: [] },
    ])('keeps the common beam continuous within the beat: $source', ({ source, deeper }) => {
        const notes = glyphs(source, '2/4');
        const short = notes.slice(0, -1);
        const beams = nativeBeamLayout(notes, measurer);
        const lines = [...root(beams.svg).querySelectorAll('line')];
        expect(lines).toHaveLength(deeper.length ? 2 : 1);
        // A shared first level spans the whole first beat. The extra level
        // belongs only to the ordinary sixteenths, not the written eighths.
        expect((Number(lines[0]!.getAttribute('x1')) - Number(lines[0]!.getAttribute('stroke-width')) / 2)).toBeCloseTo(short[0]!.x - 19 / 2, 3);
        expect((Number(lines[0]!.getAttribute('x2')) + Number(lines[0]!.getAttribute('stroke-width')) / 2)).toBeCloseTo(short.at(-1)!.x + 19 / 2, 3);
        if (deeper.length) {
            expect((Number(lines[1]!.getAttribute('x1')) - Number(lines[1]!.getAttribute('stroke-width')) / 2)).toBeCloseTo(notes[deeper[0]!]!.x - 19 / 2, 3);
            expect((Number(lines[1]!.getAttribute('x2')) + Number(lines[1]!.getAttribute('stroke-width')) / 2)).toBeCloseTo(notes[deeper[1]!]!.x + 19 / 2, 3);
        }
        expect(short.every(note => beams.claimed.get(note)?.has(0))).toBe(true);
        expect(beams.claimed.has(notes.at(-1)!)).toBe(false);
    });
    it('separates adjacent tuplets that occupy different beats', () => {
        const notes = glyphs('([1 2 3:2]) ([4 5 6:2])', '2/4');
        const lines = [...root(nativeBeamLayout(notes, measurer).svg).querySelectorAll('line')];
        expect(lines).toHaveLength(2);
        expect((Number(lines[0]!.getAttribute('x2')) + Number(lines[0]!.getAttribute('stroke-width')) / 2)).toBeCloseTo(notes[2]!.x + 19 / 2, 3);
        expect((Number(lines[1]!.getAttribute('x1')) - Number(lines[1]!.getAttribute('stroke-width')) / 2)).toBeCloseTo(notes[3]!.x - 19 / 2, 3);
    });
    it('fits the full standalone stroke, including round caps, to measured body width', () => {
        const glyph = { ...glyphs()[0]!, x: 40, y: 0 };
        const lines = root(new NativeMusicPainter(measurer).body(glyph)).querySelectorAll('line');
        expect(lines.length).toBe(1);
        expect((Number(lines[0]!.getAttribute('x1')) - Number(lines[0]!.getAttribute('stroke-width')) / 2)).toBe(30.5);
        expect((Number(lines[0]!.getAttribute('x2')) + Number(lines[0]!.getAttribute('stroke-width')) / 2)).toBe(49.5);
    });
    it('paints each connected level once and leaves isolated levels local', () => {
        const notes = glyphs().slice(0, 3).map((g, i) => ({ ...g, x: 40 + i * 50, y: 0 }));
        const beams = nativeBeamLayout(notes, measurer);
        const painter = new NativeMusicPainter(measurer);
        const local = notes.map(g => root(painter.music(g, beams.claimed.get(g))).querySelectorAll('line').length);
        expect(local).toEqual([0, 0, 0]);
        const lines = [...root(beams.svg).querySelectorAll('line')];
        expect(lines.map(l => [Number(l.getAttribute('x1')) - Number(l.getAttribute('stroke-width')) / 2, Number(l.getAttribute('x2')) + Number(l.getAttribute('stroke-width')) / 2])).toEqual([[30.5, 149.5], [80.5, 149.5]]);
        const isolated = nativeBeamLayout([notes[1]!], measurer);
        expect(isolated.svg).toBe('');
        expect(root(painter.music(notes[1]!, isolated.claimed.get(notes[1]!))).querySelectorAll('line').length).toBe(2);
    });
    it('retains an unconnected deeper level and each interactive note identity', () => {
        const notes = glyphs().slice(0, 3).map((g, i) => ({ ...g, writtenBeats: i === 1 ? .25 : .5, x: i * 50, y: 0 }));
        const beams = nativeBeamLayout(notes, measurer), painter = new NativeMusicPainter(measurer);
        expect(root(beams.svg).querySelectorAll('line').length).toBe(1);
        expect(notes.map(g => root(painter.music(g, beams.claimed.get(g))).querySelectorAll('line').length)).toEqual([0, 1, 0]);
        const layout = layoutNativeScore(parseM3NDocument('{4/4}\nN: (1 (2 3)) 4 5 6 |||'), { width: 800, paged: false, textMeasurer: measurer });
        const svg = root(renderNativePages(layout).join(''));
        for (const glyph of layout.projection.glyphs) {
            const groups = [...svg.querySelectorAll('[id]')].filter(group => group.id === glyph.id);
            expect(groups).toHaveLength(1);
            expect(groups[0]!.getAttribute('data-m3n-id')).toBe(glyph.xmlId);
        }
        expect(svg.querySelectorAll('[data-m3n-role="beam"] line').length).toBe(2);
    });
    it('respects compound beats, rests, continuity and lane-local input', () => {
        const notes = glyphs('(1 2 0 4 5 6)', '6/8').map((g, i) => ({ ...g, x: i * 40, y: 0 }));
        expect(root(nativeBeamLayout(notes, measurer).svg).querySelectorAll('line').length).toBe(2);
        const gap = [notes[0]!, { ...notes[1]!, time: 9 }];
        expect(nativeBeamLayout(gap, measurer).svg).toBe('');
        expect(nativeBeamLayout([], measurer).svg).toBe('');
    });
});
it.each([false, true])('keeps round line caps and valid XML through compound notation, paged=%s', paged => {
    const source = '{4/4}\nN: {cresc}(1 (2 3)) 4{ac((5 6))} 5 6{/} |\nL: (春风)吹过山谷间\nB: 1d^ 5d^ |\n---\nN: ([1 2 3:2]) 4 5 6 | 1~ 1~ 1 0 | {rest=2} | 1 2 3 4 |||\nB: 1d^ 5d^ | 1d^ 5d^ | {rest=2} | 1d^ 5d^ |||';
    const layout = layoutNativeScore(parseM3NDocument(source), { width: 800, paged });
    for (const page of renderNativePages(layout)) {
        const document = new DOMParser().parseFromString(page, 'image/svg+xml');
        expect(document.querySelector('parsererror')).toBeNull();
        const lines = [...document.querySelectorAll('line')];
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines)
            expect(line.getAttribute('stroke-linecap')).toBe('round');
    }
});

it('direct reduction beams match painted ink and claims with fractional positions', () => {
  const notes = glyphs('((1 2 3 4))').map((g,i)=>({...g,x:17.123456789+i*31.987654321,y:-4.123456789}))
  const painted = nativeBeamLayout(notes,measurer), measured = nativeBeamLayout(notes,measurer,false)
  expect(measured.svg).toBe('')
  expect(measured.claimed).toEqual(painted.claimed)
  expect(measured.pieces).toEqual(nativeSvgPieces(painted.svg,measurer))
})

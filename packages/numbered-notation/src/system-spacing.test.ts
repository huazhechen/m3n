import { parseM3NDocument } from '@m3n/notation';
import { expect,it } from 'vitest';
import { nativeLanePieces } from './native-lanes.js';
import { layoutNativeScore } from './native-layout.js';
const measurer = { measureText(text: string, style: {
        fontSize: number;
    }) { return { w: text.length * style.fontSize / 2, h: style.fontSize, baseline: style.fontSize * .8 }; } };
it.each([
    { kind: 'slur', music: '{lg}1 2 3 4{/}' },
    { kind: 'tie', music: '1~ (1) (2) 3 4' },
    { kind: 'tuplet', music: '[1 2 3:2] 4 5' },
])('keeps $kind strokes and labels outside the core with local collision clearance', ({ kind, music }) => {
    const document = parseM3NDocument(`{4/4}\nN: 1 2 3 4 | {br} ${music} |||`);
    const options = { width: 600, paged: false, textMeasurer: measurer };
    const native = layoutNativeScore(document, options);
    expect(native.relations.some(r => r.kind === kind)).toBe(true);
    const cores = native.systems.map(system => {
        const pieces = nativeLanePieces(system, measurer, true);
        const ink = system.lanes.flatMap(lane => pieces.get(lane.id)!.map(r => ({ top: lane.y + r.top, bottom: lane.y + r.bottom })));
        return { top: Math.min(...ink.map(r => r.top)), bottom: Math.max(...ink.map(r => r.bottom)) };
    });
    expect(cores[1]!.top - cores[0]!.bottom).toBeGreaterThanOrEqual(19.2 - 1e-6);
    const ink = nativeLanePieces(native.systems[1]!, measurer).get('melody')!;
    expect(Math.min(...ink.map(piece => native.systems[1]!.lanes[0]!.y + piece.top)) - cores[0]!.bottom).toBeLessThan(28);
    const previousInk = nativeLanePieces(native.systems[0]!, measurer).get('melody')!;
    let checked = 0;
    for (const upper of previousInk)
        for (const lower of ink) {
            if (upper.right <= lower.left || upper.left >= lower.right)
                continue;
            expect(native.systems[1]!.lanes[0]!.y + lower.top - native.systems[0]!.lanes[0]!.y - upper.bottom).toBeGreaterThanOrEqual(9.6 - 1e-6);
            checked++;
        }
    expect(checked).toBeGreaterThan(0);
});
it('excludes grace notes from the native core while keeping their painted ink for collisions', () => {
    const native = layoutNativeScore(parseM3NDocument('{4/4}\nN: 1{ac(7eee)} 2 3 4 |||'), { width: 600, paged: false, textMeasurer: measurer });
    const system = native.systems[0]!;
    const core = nativeLanePieces(system, measurer, true).get('melody')!;
    const ink = nativeLanePieces(system, measurer).get('melody')!;
    expect(Math.min(...ink.map(r => r.top))).toBeLessThan(Math.min(...core.map(r => r.top)));
    expect(Math.max(...core.map(r => r.bottom)) - Math.min(...core.map(r => r.top))).toBeCloseTo(24);
});

import { parseM3NDocument } from '@m3n/notation';
import { describe,expect,it } from 'vitest';
import { nativeLanePieces } from '../native-lanes.js';
import { layoutNativeScore, repaginateNativeLayout } from '../native-layout.js';
import { nativeSystemCore } from '../native-core.js';
import { paginateScoreBlocks, prepareScorePagination } from './pagination.js';
const options = { pageHeight: 400, margin: 20, gap: 10 };
describe('native measured-block pagination', () => {
    it('keeps the header and all pages at natural gaps, leaving unused space below', () => {
        const result = paginateScoreBlocks([{ height: 60 }, { height: 100 }, { height: 100 }, { height: 200 }], options);
        expect(result.heights).toEqual([400, 400]);
        expect(result.positions.map(position => position.page)).toEqual([0, 0, 0, 1]);
        expect(result.positions[1]!.top).toBe(90);
        expect(result.positions[2]!.top).toBe(200);
        expect(result.positions[3]!.top).toBe(20);
    });
    it('retains fixed gaps when a later block moves to another page', () => {
        const result = paginateScoreBlocks([{ height: 100 }, { height: 100 }, { height: 200 }], options);
        expect(result.positions.map(position => position.top)).toEqual([20, 130, 20]);
    });
    it('omits a section gap at the start of a page', () => {
        const result = paginateScoreBlocks([{ height: 280 }, { height: 100, gapBefore: 30 }], options);
        expect(result.positions[1]).toEqual({ page: 1, top: 20 });
    });
    it('uses natural height in continuous mode and rejects an unplaceable block', () => {
        expect(paginateScoreBlocks([{ height: 60 }, { height: 100 }], { ...options, pageHeight: Infinity }).heights).toEqual([210]);
        expect(() => paginateScoreBlocks([{ height: 361 }], options)).toThrow('单个谱行');
    });
});
it('fits paged core gaps while keeping continuous core gaps at 1.2em', () => {
    const document = parseM3NDocument('{4/4}\nN: ' + Array.from({ length: 30 }, () => '1 2 3 4 |').join(' '));
    const options = { width: 320, paged: true };
    const natural = layoutNativeScore(document, options);
    const continuous = layoutNativeScore(document, { ...options, paged: false });
    expect(natural.pages.length).toBeGreaterThan(1);
    const step = (layout: ReturnType<typeof layoutNativeScore>) => {
        const [first, second] = layout.systems;
        const before = nativeLanePieces(first!, layout.measurer, true).get(first!.lanes[0]!.id)!;
        const after = nativeLanePieces(second!, layout.measurer, true).get(second!.lanes[0]!.id)!;
        return second!.lanes[0]!.y + Math.min(...after.map(r => r.top)) - first!.lanes[0]!.y - Math.max(...before.map(r => r.bottom));
    };
    expect(step(natural)).toBeGreaterThanOrEqual(natural.pages[0]!.coreGap! - 1e-6);
    for (const page of natural.pages) {
        expect(page.coreGap).toBeGreaterThanOrEqual(28.8);
        expect(page.coreGap).toBeLessThanOrEqual(31.68 + 1e-6);
    }
    expect(step(continuous)).toBeCloseTo(28.8);
    for (const width of [320, 600, 800, 1000]) {
        const paged = layoutNativeScore(document, { width, paged: true });
        const continuous = layoutNativeScore(document, { width, paged: false });
        expect(paged.systems).toHaveLength(continuous.systems.length);
        paged.systems.forEach((system, index) => {
            const counterpart = continuous.systems[index]!;
            expect(system.bottom - system.top).toBeCloseTo(counterpart.bottom - counterpart.top);
            const previous = paged.systems[index - 1];
            if (previous?.page === system.page)
                expect(system.lanes[0]!.y - previous.lanes[0]!.y).toBeGreaterThanOrEqual(28 - 1e-6);
        });
    }
});
it('uses 24px core clearance and 12px ornament clearance without combining remote extremes', () => {
    const block = (left: number, top: number, bottom: number) => ({ height: bottom - top, baseline: 0, core: { top: -2, bottom: 2 }, ink: [{ left, right: left + 10, top, bottom }] });
    const overlapping = paginateScoreBlocks([block(0, -8, 20), block(0, -18, 4)], { ...options, elastic: true, gap: 24 });
    expect(overlapping.positions[1]!.top - overlapping.positions[0]!.top).toBe(50);
    const remote = paginateScoreBlocks([block(0, -20, 40), block(100, -40, 2)], { ...options, elastic: true, gap: 24 });
    expect(remote.positions[1]!.top - remote.positions[0]!.top).toBe(28);
});
it('reserves the entire core even without horizontal overlap and resets at page starts', () => {
    const blocks = [
        { height: 35, baseline: 2, core: { top: 0, bottom: 35 }, ink: [{ left: 0, right: 10, top: 0, bottom: 35 }] },
        { height: 4, baseline: 2, core: { top: 0, bottom: 4 }, ink: [{ left: 100, right: 110, top: 0, bottom: 4 }] },
    ];
    const continuous = paginateScoreBlocks(blocks, { pageHeight: Infinity, margin: 10, gap: 24, elastic: true });
    expect(continuous.positions[1]!.top - continuous.positions[0]!.top).toBe(59);
    const paged = paginateScoreBlocks(blocks, { pageHeight: 70, margin: 10, gap: 24, elastic: true });
    expect(paged.positions).toEqual([{ page: 0, top: 10 }, { page: 1, top: 10 }]);
});

it('reduces only gaps following visible lyrics, including after repagination', () => {
    const music = '{4/4}\nN: 1 2 3 4 | {br} 1 2 3 4 | {br} 1 2 3 4 |||';
    const layout = layoutNativeScore(parseM3NDocument(music + '\nL: 春风花开 _ _ _ _ 山间流水'), { width: 600, paged: false, minimumNoteGap: 9 });
    const gaps = () => layout.systems.slice(1).map((system, index) =>
        nativeSystemCore(system, layout.measurer)!.top - nativeSystemCore(layout.systems[index]!, layout.measurer)!.bottom);
    expect(layout.systems).toHaveLength(3);
    expect(gaps()[0]).toBeCloseTo(19.2);
    expect(gaps()[1]).toBeCloseTo(28.8);
    repaginateNativeLayout(layout, true);
    // A roomy page can still stretch both gaps to the original ceiling.
    expect(gaps()[0]).toBeCloseTo(31.68);
    expect(gaps()[1]).toBeCloseTo(31.68);
    repaginateNativeLayout(layout, false);
    expect(gaps()[0]).toBeCloseTo(19.2);
    expect(gaps()[1]).toBeCloseTo(28.8);
});

it.each([0.6, 0.8, 1.2])('keeps a tighter explicit leading of %sem for lyric rows', leading => {
    const document = parseM3NDocument(`{leading=${leading}}{4/4}\nN: 1 2 3 4 | {br} 1 2 3 4 |||\nL: 春风花开山间流水`);
    const layout = layoutNativeScore(document, { width: 600, paged: false, minimumNoteGap: 9 });
    const gap = nativeSystemCore(layout.systems[1]!, layout.measurer)!.top - nativeSystemCore(layout.systems[0]!, layout.measurer)!.bottom;
    expect(gap).toBeCloseTo(Math.min(leading, .8) * 24);
});

it('fits lyric gaps between 0.8em and the unchanged maximum while preserving collision clearance', () => {
    const block = { height: 20, baseline: 0, core: { top: 0, bottom: 20 }, coreGapScale: 2 / 3,
        ink: [{ left: 0, right: 10, top: 0, bottom: 20 }] };
    const result = paginateScoreBlocks([block, block, block], { pageHeight: 110, margin: 0, gap: 28.8, maxGap: 31.68, elastic: true });
    expect(result.positions.map(position => position.page)).toEqual([0, 0, 0]);
    expect(result.positions[1]!.top - result.positions[0]!.top - 20).toBeCloseTo(25);
    expect(result.positions[2]!.top + 20).toBeCloseTo(110);
    const ornament = { ...block, core: { top: 0, bottom: 0 }, ink: [{ left: 0, right: 10, top: 0, bottom: 40 }] };
    const collision = paginateScoreBlocks([ornament, block], { pageHeight: Infinity, margin: 0, gap: 28.8, elastic: true });
    expect(collision.positions[1]!.top - collision.positions[0]!.top).toBeCloseTo(49.6);
    const ordinary = paginateScoreBlocks([{ ...ornament, coreGapScale: 1 }, block], { pageHeight: Infinity, margin: 0, gap: 28.8, elastic: true });
    expect(ordinary.positions[1]!.top - ordinary.positions[0]!.top).toBeCloseTo(54.4);
});

it('reuses immutable ink constraints without retaining page membership or fitted gaps', () => {
    const blocks = Array.from({ length: 8 }, (_, index) => ({ height: 48, baseline: 20,
        core: { top: 8, bottom: 30 }, coreGapScale: index % 2 ? .6 : 1,
        gapBefore: index % 3 ? 0 : 9,
        ink: [{ left: 0, right: 40, top: 0, bottom: 48 }, { left: 45, right: 60, top: 12, bottom: 55 }],
        boundaryInk: [{ left: 80, right: 90, top: -4, bottom: 5 }],
    }))
    const paginate = prepareScorePagination(blocks)
    for (const pageHeight of [Infinity, 300, 900, 300, Infinity]) for (const gap of [16, 24]) {
        const options = { pageHeight, margin: 12, gap, maxGap: gap * 1.1, elastic: true }
        expect(paginate(options)).toEqual(paginateScoreBlocks(blocks, options))
        expect(prepareScorePagination(blocks,{immutableBlocks:true})(options)).toEqual(paginate(options))
        // The same cached blocks can have different local indices in a new plan.
        expect(prepareScorePagination(blocks.slice(2),{immutableBlocks:true})(options))
          .toEqual(prepareScorePagination(blocks.slice(2))(options))
    }
    expect(() => paginate({ pageHeight: 40, margin: 12, gap: 16 })).toThrow('单个谱行')
})

it('keeps inline-section core clearance at 1.5em through lyric tightening and page fitting', () => {
    const block = { height: 20, baseline: 0, core: { top: 0, bottom: 20 }, coreGapScale: 2 / 3,
        ink: [{ left: 0, right: 20, top: 0, bottom: 20 }] };
    const paginate = prepareScorePagination([block, { ...block, coreGapBefore: 36 }]);
    for (const pageHeight of [Infinity, 400]) {
        const result = paginate({ pageHeight, margin: 0, gap: 28.8, maxGap: 31.68 });
        expect(result.positions[1]!.top - result.positions[0]!.top - 20).toBeCloseTo(36);
    }
    // A section beginning on a new page gets no inter-system clearance.
    expect(paginate({ pageHeight: 60, margin: 0, gap: 28.8 }).positions[1]).toEqual({ page: 1, top: 0 });
});
it('uses half the section core clearance for protruding decoration collisions', () => {
    const upper = { height: 50, baseline: 0, core: { top: 0, bottom: 20 },
        ink: [{ left: 0, right: 20, top: 0, bottom: 50 }] };
    const lower = { height: 20, baseline: 0, core: { top: 0, bottom: 20 }, coreGapBefore: 36,
        ink: [{ left: 0, right: 20, top: 0, bottom: 20 }] };
    const result = prepareScorePagination([upper, lower])({ pageHeight: Infinity, margin: 0, gap: 28.8 });
    expect(result.positions[1]!.top - result.positions[0]!.top - 50).toBeCloseTo(18);
});

it('matches exhaustive primitive collisions even when a remote row reaches past its neighbours', () => {
    let seed = 4721;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let trial = 0; trial < 80; trial++) {
        const blocks = Array.from({ length: 12 }, () => ({
            height: 200, baseline: 0, core: { top: -5, bottom: 5 },
            ink: Array.from({ length: 8 }, () => {
                const left = random() * 300, top = -10 - random() * 100;
                return { left, right: left + 2 + random() * 30, top, bottom: 10 + random() * 100 };
            }),
        }));
        const baselines: number[] = [];
        for (const [index, block] of blocks.entries()) {
            let baseline = 10 - Math.min(0, ...block.ink.map(piece => piece.top));
            if (index) baseline = Math.max(baseline, baselines[index - 1]! + 10 + 24);
            for (let before = 0; before < index; before++)
                for (const above of blocks[before]!.ink) for (const below of block.ink)
                    if (above.left < below.right && above.right > below.left)
                        baseline = Math.max(baseline, baselines[before]! + above.bottom - below.top + 24 * .5);
            baselines.push(baseline);
        }
        const actual = prepareScorePagination(blocks, { })({ pageHeight: Infinity, margin: 10, gap: 24 });
        expect(actual.positions.map(position => position.top)).toEqual(baselines);
    }
});


it('shares exact fixed attachment clearance with remote-row checks and baseline normalization', () => {
    const upper = { height: 100, baseline: 10, core: { top: 10, bottom: 20 },
        ink: [{ left: 0, right: 20, top: 10, bottom: 20 }],
        boundaryInk: [{ left: 100, right: 120, top: 10, bottom: 110 }],
        edgeInk: [{ left: 100, right: 120, top: 10, bottom: 110, gap: 7 }] };
    const middle = { height: 10, core: { top: 0, bottom: 10 },
        ink: [{ left: 30, right: 50, top: 0, bottom: 10 }] };
    const lower = { height: 10, core: { top: 0, bottom: 10 },
        ink: [{ left: 100, right: 120, top: 0, bottom: 10 }] };
    const result = prepareScorePagination([upper, middle, lower])({ pageHeight: Infinity, margin: 0, gap: 20 });
    expect(result.positions.map(position => position.top)).toEqual([-10, 30, 107]);
    // The fixed 7px clearance is independent of the 0.5 * core-gap rule.
    expect(prepareScorePagination([upper, lower])({ pageHeight: Infinity, margin: 0, gap: 40 }).positions[1]!.top).toBe(107);
});

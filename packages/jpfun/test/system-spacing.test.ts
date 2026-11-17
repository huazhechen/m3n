import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginateInkSystems } from '../src/layout/system-spacing.js';
import { normalizePageConfig } from '../src/layout/page.js';
import { paintedNodeRegions } from '../src/layout/painted-ink.js';
import { defaultTextMeasurer } from '../src/render/text.js';
import { compileScore } from '../src/pipeline.js';

const page = normalizePageConfig({ width: 400, height: Infinity, marginTop: 10, marginBottom: 10 });
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const smallCore = { top: -2, bottom: 2 };
test('keeps 24px between whole cores and only 12px at ornament collisions', () => {
    const plain = paginateInkSystems([[rect(0, -2, 10, 4)], [rect(100, -2, 10, 4)]], page, 24, 12);
    assert.equal(plain.baselines[1] - plain.baselines[0], 28);
    const collision = paginateInkSystems([[rect(0, -8, 10, 28)], [rect(0, -18, 10, 22)]], page, 24, 12, [], [], [smallCore, smallCore]);
    assert.equal(collision.baselines[1] - collision.baselines[0], 50);
});
test('remote ornaments do not expand the core or combine non-overlapping extremes', () => {
    const packed = paginateInkSystems([[rect(0, -20, 10, 60)], [rect(100, -40, 10, 42)]], page, 24, 12, [], [], [smallCore, smallCore]);
    assert.equal(packed.baselines[1] - packed.baselines[0], 28);
});
test('checks earlier ornaments and preserves explicit and automatic page breaks', () => {
    const profiles = [[rect(0, 0, 10, 70)], [rect(100, 0, 10, 2)], [rect(0, 0, 10, 2)]];
    const cores = profiles.map(() => ({ top: 0, bottom: 2 }));
    const packed = paginateInkSystems(profiles, page, 24, 12, [], [], cores);
    assert.equal(packed.baselines[2] - packed.baselines[0], 82);
    const finite = normalizePageConfig({ ...page, height: 100 });
    const paged = paginateInkSystems(profiles, finite, 24, 12, [], [0, 0, 12], cores);
    assert.equal(paged.pages.length, 2);
    assert.equal(paged.baselines[2], 110);
    assert.equal(paginateInkSystems(profiles.slice(0, 2), page, 24, 12, [undefined, false], [], cores).pages.length, 2);
});
test('engraving measures actual note cores and recalculates page bounds', () => {
    const result = compileScore('@page(width=400px,height=0px,top=10px,bottom=10px) 1 2 3 4 @br() 1 2 3 4', { systemSpacing: { coreGap: 24, inkGap: 12 } });
    assert.equal(result.diagnostics.filter(d => d.severity === 'error').length, 0);
    const ink = [0, 1].map(line => result.layout.objects.filter(n => n.layoutLine === line && !n.T.isZero()).flatMap(n => paintedNodeRegions(n, defaultTextMeasurer, true)));
    assert.ok(Math.abs(Math.min(...ink[1].map(r => r.y)) - Math.max(...ink[0].map(r => r.y + r.h)) - 24) < 1e-6);
    assert.ok(ink[1].every(r => r.y + r.h <= result.layout.pages[0].bounds.h - 10 + 1e-6));
});
test('all lyric rows are part of the full-width core, including initial and inter-verse gaps', () => {
    const measure = (lyrics: string) => {
        const result = compileScore(`@page(height=0px) @voice({1 2 @br() 3 4}, , ${lyrics}, compactlyrics=true)`, {
            systemSpacing: { coreGap: 24, inkGap: 12 },
            textMeasurer: { measureText(text, style) { return { w: text.length * style.fontSize / 2, h: style.fontSize, baseline: style.fontSize * .8 }; } },
        });
        assert.equal(result.diagnostics.filter(d => d.severity === 'error').length, 0);
        const first = result.layout.objects.find(n => n.layoutLine === 0 && !n.T.isZero())!;
        const second = result.layout.objects.find(n => n.layoutLine === 1 && !n.T.isZero())!;
        return second.box.y - first.box.y;
    };
    const plain = measure('""'), one = measure('"春天花开"'), two = measure('"春天花开", "春天花开"');
    assert.ok(Math.abs(plain - 46) < 1e-6);
    assert.ok(Math.abs(one - plain - (22 * .32 + 22 * .82)) < 1e-6);
    assert.ok(Math.abs(two - one - (22 * .24 + 22 * .82)) < 1e-6);
});

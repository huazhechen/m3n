import { parseM3NDocument,validateM3NDiagnostics } from '@m3n/notation';
import { expect,it } from 'vitest';
import { nativeRibbonRange } from './native-curve.js';
import { nativeSvgPieces } from './native-ink.js';
import { nativeLanePieces } from './native-lanes.js';
import { layoutNativeScore } from './native-layout.js';
import type { TextMeasurer } from './native-measure.js';
const textMeasurer: TextMeasurer = { measureText(text, style) {
        return { w: [...text].length * style.fontSize * .5, h: style.fontSize * .7, baseline: style.fontSize * .7 };
    } };
it.each([
    '{lg}1 2 3 4{/}',
    '1 {mf}2 3 4',
    '1 2{tr} 3 4',
    '{cresc}1 2 3 4{/}',
])('places an ending around painted music primitives in the native engine: %s', music => {
    const source = `{4/4}\nN: ||: 1 2 3 4 |\n---V1\nN: ${music} :||\n---V2\nN: 1 2 3 4 |||`;
    expect(validateM3NDiagnostics(source)).toEqual([]);
    const document = parseM3NDocument(source), options = { width: 1000, paged: false, textMeasurer };
    const native = layoutNativeScore(document, options), system = native.systems[0]!;
    let checked = 0;
    for (const mark of nativeSvgPieces(system.voltas![0]!.svg, textMeasurer)) {
        const ink = [...(system.relationLayout ?? [])].flatMap(([, placed]) => placed.arc
            ? [nativeRibbonRange(placed.arc, mark.left, mark.right)].filter(piece => piece !== undefined).map(piece => ({...piece,left:mark.left,right:mark.right}))
            : nativeSvgPieces(placed.svg, textMeasurer));
        ink.push(...nativeLanePieces(system, textMeasurer, false, false).get('melody')!);
        for (const obstacle of ink) {
            if (obstacle.right <= mark.left || obstacle.left >= mark.right)
                continue;
            expect(mark.bottom).toBeLessThanOrEqual(obstacle.top - 2 + .001);
            checked++;
        }
    }
    expect(checked).toBeGreaterThan(0);
    expect(system.voltas![0]!.top).toBeCloseTo(system.voltas![1]!.top, 5);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileScore, RecordingPainter } from '../src/core.js';
import { ribbonAtX } from '../src/functions/tie/ribbon.js';

test('an intervening octave dot clears the ribbon by its actual footprint and port gap', () => {
    const result = compileScore('@page(width=320px,height=0px,left=11px,right=11px) @meter(4,4) @div({0 6@a @note("3\'") @note("2\'") @note("1\'") 7 6 5},2) 4@b 0 | @tie(a,b)', { alignRelations: true, noteGap: 13.2, minimumNoteGap: 8.8 });
    assert.equal(result.diagnostics.filter(diagnostic => diagnostic.severity === 'error').length, 0, JSON.stringify(result.diagnostics));
    const dots = result.layout.objects.flatMap(node => {
        const painter = new RecordingPainter();
        node.paint(painter);
        for (const decoration of node.decorations) decoration.paint?.(painter);
        return painter.commands.filter(command => command.kind === 'circle');
    });
    assert(dots.length > 0);
    const painter = new RecordingPainter();
    for (const attachment of result.layout.attachments) attachment.paint(painter);
    const ribbon = painter.commands.find(command => command.kind === 'path');
    assert(ribbon?.kind === 'path');
    const gaps = dots.flatMap(dot => [dot.cx - dot.r, dot.cx + dot.r].map(x => dot.cy - dot.r - ribbonAtX(ribbon.commands, x)!.bottom));
    assert(Math.abs(Math.min(...gaps) - 22 * .05) < 1e-6,
        `the controlling dot must retain its measured 0.05em gap without borrowing the width of lower beams: ${Math.min(...gaps)}`);
});

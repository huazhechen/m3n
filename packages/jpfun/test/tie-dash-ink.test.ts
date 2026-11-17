import { test } from 'node:test';
import { attachmentCommands, assert, compileValid, layoutOf, nearly, recordCommands } from './helpers.js';

for (const size of [16, 22, 32]) {
    test(`an interior sustain clears an arc by its painted stroke at ${size}px`, () => {
        const layout = compileValid('1@a - 1@b @tie(a,b,height=0.1em)', {
            variables: { fontsize: size },
            textMeasurer: { measureText(_text, style) {
                return { w: style.fontSize * 0.5, h: style.fontSize * 0.6,
                    baseline: style.fontSize * 0.6, inkBottom: style.fontSize * 0.6 };
            } },
        }).layout;
        const path = attachmentCommands(layout.attachments[0]).find(command => command.kind === 'path');
        assert(path?.kind === 'path' && path.commands[0]?.op === 'M', 'expected arc');
        const head = layout.objects[0];
        assert(nearly(path.commands[0].y, head.box.y), 'empty space above a dash must not lift the arc off its musical head');
        const stroke = recordCommands(layout).find(command => command.kind === 'line');
        assert(stroke?.kind === 'line', 'expected painted sustain');
        assert(path.commands[0].y < stroke.y1 - Number(stroke.style?.strokeWidth) / 2,
            'the unshifted arc already sits above the actual sustain stroke');
    });

    test(`a sustain endpoint uses its painted top at ${size}px`, () => {
        const layout = layoutOf('1 -@a 1@b @tie(a,b,height=0.1em)', size);
        const path = attachmentCommands(layout.attachments[0]).find(command => command.kind === 'path');
        const stroke = recordCommands(layout).find(command => command.kind === 'line');
        assert(path?.kind === 'path' && path.commands[0]?.op === 'M' && stroke?.kind === 'line', 'expected arc and sustain');
        assert(nearly(path.commands[0].y, stroke.y1 - Number(stroke.style?.strokeWidth) / 2),
            'a dash endpoint must join the real stroke instead of its empty full-height box');
    });
}

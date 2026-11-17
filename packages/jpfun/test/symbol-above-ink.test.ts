import { test } from 'node:test';
import { compileScore } from '../src/pipeline.js';
import { paintedCommandRegions } from '../src/layout/painted-ink.js';
import { defaultTextMeasurer } from '../src/render/text.js';
import { assert, nearly, recordCommands } from './helpers.js';

for (const name of ['mf', 'mp', 'ff', 'tr++']) for (const size of [8, 12, 24]) {
    test(`anchored ${name} at ${size}px publishes individual painted primitives`, () => {
        const { layout } = compileScore(`1@a 2 3 4 @symbol("${name}",size=${size}px,above=a)`);
        const geometry = layout.attachments[0];
        const painted = recordCommands(layout)
            .filter(command => command.kind === 'path' && command.style?.semantic?.role === 'mark')
            .flatMap(command => paintedCommandRegions(command, defaultTextMeasurer));
        assert(painted.length > 1, 'exercise a symbol composed of multiple paths');
        assert(geometry.regions.length === painted.length, 'empty space between paths must not become ink');
        for (const ink of painted) assert(geometry.regions.some(region => nearly(region.x, ink.x)
            && nearly(region.y, ink.y) && nearly(region.w, ink.w) && nearly(region.h, ink.h)),
        'each published obstacle must match a final painted primitive');
    });
}

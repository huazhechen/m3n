import { test } from 'node:test';
import { compileScore } from '../src/pipeline.js';
import type { PathCommand } from '../src/render/types.js';
import { assert, attachmentCommands, nearly, recordCommands } from './helpers.js';

// Trace the painted ribbon independently of the layout solver. Both edges and
// cross-system plateaus participate; comparing bounding boxes misses crossings.
function outline(commands: readonly PathCommand[]) {
    const points: { x: number; y: number }[] = [];
    let cursor = { x: 0, y: 0 };
    for (const command of commands) {
        if (command.op === 'Z') continue;
        const start = cursor;
        cursor = command;
        if (command.op === 'M') { points.push(command); continue; }
        const controls = command.op === 'C'
            ? [start, { x: command.cx1, y: command.cy1 }, { x: command.cx2, y: command.cy2 }, command]
            : command.op === 'Q' ? [start, { x: command.cx, y: command.cy }, command] : [start, command];
        for (let step = 1; step <= 256; step++) {
            let work = controls.map(point => ({ x: point.x, y: point.y }));
            const t = step / 256;
            while (work.length > 1) work = work.slice(1).map((point, index) => ({
                x: work[index].x * (1 - t) + point.x * t,
                y: work[index].y * (1 - t) + point.y * t,
            }));
            points.push(work[0]);
        }
    }
    return points;
}

function boundsAt(points: ReturnType<typeof outline>, x: number) {
    const ys: number[] = [];
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) continue;
        if (nearly(a.x, b.x)) ys.push(a.y, b.y);
        else ys.push(a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x));
    }
    return { top: Math.min(...ys), bottom: Math.max(...ys) };
}

function arcs(source: string, alignRelations = true) {
    const result = compileScore(source, { alignRelations });
    assert(result.diagnostics.length === 0, 'arc fixture must compile without diagnostics');
    return result.layout.attachments.filter(item => item.sourceSpan
        && source.slice(item.sourceSpan.start, item.sourceSpan.end).startsWith('@tie('));
}

function assertSeparated(source: string) {
    const items = arcs(source);
    for (let index = 1; index < items.length; index++) {
        const outer = items[index];
        const outerPaths = attachmentCommands(outer).filter(command => command.kind === 'path');
        for (const inner of items.slice(0, index)) {
            const innerPaths = attachmentCommands(inner).filter(command => command.kind === 'path');
            for (const [i, a] of outer.regions.entries()) for (const [j, b] of inner.regions.entries()) {
                if (a.line !== b.line) continue;
                const left = Math.max(a.x, b.x), right = Math.min(a.x + a.w, b.x + b.w);
                if (right <= left) continue;
                const outerPoints = outline(outerPaths[i].commands), innerPoints = outline(innerPaths[j].commands);
                for (let x = left + 0.01; x < right; x += 0.25) {
                    const gap = boundsAt(innerPoints, x).top - boundsAt(outerPoints, x).bottom;
                    assert(gap >= 3, `ribbons must stay visibly separated throughout the overlap, gap=${gap}: ${source}`);
                }
            }
        }
    }
}

test('overlapping ties and legato arcs separate their complete ribbons, including shared endpoints', () => {
    for (const source of [
        "3'@a 2' 1'@b 1'@c 1' 2'@d @tie(b,c) @tie(a,d)",
        '1@a 1@b 2@c @tie(a,b) @tie(a,c)',
        '1@a 2@b 2@c @tie(b,c) @tie(a,c)',
        '1@a 1@b @tie(a,b) @tie(a,b)',
        '1@a 1@b 2@c @tie(a,b) @tie(a,c,height=3px)',
        '1@a 1@b 1@c 2@d @tie(b,c) @tie(a,c) @tie(a,d)',
        '1@a 1@b 2@c 2@d @tie(a,c) @tie(b,d)',
    ]) assertSeparated(source);
});

test('cross-system and cross-page arc fragments reserve their outer layer on every affected system', () => {
    for (const breaks of ['@br()', '@br() 2 @br()']) assertSeparated(
        `@page(width=240px,height=100px,top=10px,bottom=10px)
        3'@a 2' 1'@b ${breaks} 1'@c 1' 2'@d @tie(b,c) @tie(a,d)`,
    );
});

test('adjacent arcs, other staves and compilation without relation alignment retain their ports', () => {
    for (const source of [
        '1@a 2@b 3@c @tie(a,b) @tie(b,c)',
        '@stack({1@a 1@b},{2@c 3@d}) @tie(a,b) @tie(c,d)',
    ]) {
        const local = arcs(source, false), aligned = arcs(source);
        for (const [index, item] of aligned.entries()) {
            const first = attachmentCommands(item).find(command => command.kind === 'path');
            const original = attachmentCommands(local[index]).find(command => command.kind === 'path');
            assert(first?.commands[0].op === 'M' && original?.commands[0].op === 'M', 'arc must have a start point');
            assert(nearly(first.commands[0].y, original.commands[0].y), 'unrelated arcs must not lift one another');
        }
    }
    const source = '1@a 2@b 2@c @tie(b,c) @tie(a,c)';
    const paths = arcs(source, false).map(item => attachmentCommands(item).find(command => command.kind === 'path'));
    assert(paths[0]?.commands[0].op === 'M' && paths[1]?.commands[0].op === 'M'
        && nearly(paths[0].commands[0].y, paths[1].commands[0].y), 'default compilation must retain local arc geometry');
});

test('same-system arcs use the higher endpoint for a level, horizontally symmetric ribbon', () => {
    for (const source of [
        "1@a 2'@b @tie(a,b)",
        "1''@a 2'@b @tie(a,b)",
        "@up(1,3')@a 2@b @tie(a,b)",
        "1@a 2''@b @tie(a,b,height=3px)",
    ]) {
        const result = compileScore(source, { alignRelations: true });
        const [path] = attachmentCommands(result.layout.attachments[0]).filter(command => command.kind === 'path');
        const [start, outer] = path.commands;
        assert(start.op === 'M' && outer.op === 'C', 'expected a cubic ribbon');
        const ports = result.layout.objects.map(node => node.box.y + (node.ports['tie.top']?.y ?? 0));
        assert(nearly(start.y, Math.min(...ports)) && nearly(start.y, outer.y), 'both ends must use the higher musical port');
        assert(nearly(outer.cy1, outer.cy2) && nearly(outer.cx1 - start.x, outer.x - outer.cx2), 'the outer edge must be symmetric');
        if (source.includes('height=3px')) assert(nearly((start.y - outer.cy1) * 0.75, 3), 'leveling must preserve explicit arc height');
    }
});

test('arc lower edges clear intervening octave dots in same-system and split fragments', () => {
    for (const fontSize of [20, 40]) for (const notes of [
        "1@a 2''@m 3@b",
        "1@a 2''@m 3 4@b",
        "1@a @up(2,3'')@m 4@b",
        "1@a 2''@m @br() 3@b",
        "1@a @br() 2''@m 3@b",
        "1@a @br() 2''@m @br() 3@b",
    ]) {
        const result = compileScore(`${notes} @tie(a,b)`, { alignRelations: true, variables: { fontsize: fontSize } });
        const middle = result.layout.objects.find(node => node.ast.labelable?.()?.label === 'm')!;
        assert(middle, 'fixture must contain its labeled middle note');
        const arc = result.layout.attachments[0];
        const index = arc.regions.findIndex(region => region.line === middle.layoutLine);
        const path = attachmentCommands(arc).filter(command => command.kind === 'path')[index];
        const points = outline(path.commands);
        const dots = recordCommands(result.layout).filter(command => command.kind === 'circle');
        assert(dots.length > 0, 'fixture must contain upper octave dots');
        for (const dot of dots) for (const x of [dot.cx - dot.r, dot.cx, dot.cx + dot.r]) {
            assert(boundsAt(points, x).bottom <= dot.cy - dot.r - fontSize * 0.045,
                `the complete arc band must clear the middle octave dots: ${notes}`);
        }
    }
    const result = compileScore("1@a 2' 3@b @tie(a,b)", { alignRelations: true });
    const [path] = attachmentCommands(result.layout.attachments[0]).filter(command => command.kind === 'path');
    assert(path.commands[0].op === 'M' && nearly(path.commands[0].y, result.layout.objects[0].box.y),
        'an arc that already clears middle dots must retain its original height above the endpoints');
});

// M3N addition: generic automatic line breaking using the engine's natural geometry.
import { ANCHOR_KEY, type VisualTemporalNode } from '../functions/temporal.js';
import { ASTBraceNode, ASTFunctionNode, type ASTNodeBase } from '../functions/ASTtypes.js';
import type { SourceSpan } from '../parser/types.js';
import type { DocumentLayoutResult } from './engine.js';

const isOpeningRepeat = (node: VisualTemporalNode) => node.ast instanceof ASTFunctionNode
    && node.ast.callName === 'bar' && (node.ast as ASTFunctionNode & { type?: number }).type === 3;

/** Source positions for explicit breaks; all parallel members at a boundary share one break. */
export function automaticBreakPositions(layout: DocumentLayoutResult, contentWidth: number): number[] {
    const insertions = new Set<number>();
    const leftOf = (node: VisualTemporalNode) => layout.horizontalBounds?.get(node)?.x ?? node.box.x;
    const rightOf = (node: VisualTemporalNode) => { const box = layout.horizontalBounds?.get(node) ?? node.box; return box.x + box.w; };
    const lines = new Map<number, VisualTemporalNode[]>();
    for (const node of layout.objects) {
        const line = lines.get(node.layoutLine) ?? [];
        line.push(node); lines.set(node.layoutLine, line);
    }
    for (const nodes of lines.values()) {
        // All zero-time controls at a boundary travel with the next note. Inserting
        // a break before each control creates several empty musical lines.
        const breakColumn = (members: VisualTemporalNode[], time: VisualTemporalNode['t']) => {
            const byTrack = new Map<VisualTemporalNode['track'], number>();
            for (const node of members) {
                if (!node.t.equals(time) || node.mergeKey === ANCHOR_KEY && !isOpeningRepeat(node)) continue;
                const position = breakPosition(node.ast);
                byTrack.set(node.track, Math.min(byTrack.get(node.track) ?? Infinity, position));
            }
            for (const position of byTrack.values()) insertions.add(position);
        };
        const musical = nodes.filter(node => node.T.compare(0) > 0);
        if (!musical.length) continue;
        const bars = nodes.filter(node => node.mergeKey === ANCHOR_KEY && node.t.compare(musical[0].t) > 0);
        const times = [...new Set(bars.map(node => node.t.toString()))];
        const measures: { nodes: VisualTemporalNode[]; end: number; start: number }[] = [];
        let pending = [...nodes];
        for (const key of times) {
            const bar = bars.find(node => node.t.toString() === key)!;
            const members = pending.filter(node => node.t.compare(bar.t) < 0 || node.t.compare(bar.t) === 0 && node.mergeKey === ANCHOR_KEY && !isOpeningRepeat(node));
            pending = pending.filter(node => !members.includes(node));
            if (members.some(node => node.T.compare(0) > 0)) measures.push({ nodes: members, start: Math.min(...members.map(leftOf)), end: Math.max(...members.map(rightOf)) });
        }
        if (pending.some(node => node.T.compare(0) > 0)) measures.push({ nodes: pending, start: Math.min(...pending.map(leftOf)), end: Math.max(...pending.map(rightOf)) });
        // A very dense single measure must reflow too, rather than compressing glyphs.
        for (const measure of measures) {
            if (measure.end - measure.start <= contentWidth * 0.94) continue;
            const timed = measure.nodes.filter(node => node.T.compare(0) > 0);
            const tupletRanges = new Map<ASTNodeBase, { start: number; end: number }>();
            for (const node of timed) for (let ast = node.ast.parent; ast; ast = ast.parent) {
                if (!(ast instanceof ASTFunctionNode) || ast.callName !== 'tuplet') continue;
                const range = tupletRanges.get(ast) ?? { start: Infinity, end: -Infinity };
                range.start = Math.min(range.start, node.t.toNumber()); range.end = Math.max(range.end, node.t.toNumber() + node.T.toNumber());
                tupletRanges.set(ast, range);
            }
            // Balance the entire measure instead of greedily filling its first
            // line and leaving a few notes (or a single rest) on the next one.
            const times = [...new Map(timed.map(node => [node.t.toString(), node.t])).values()];
            const boundaries = times.filter(time => ![...tupletRanges.values()].some(range => time.toNumber() > range.start && time.toNumber() < range.end));
            const groups = boundaries.map((time, index) => {
                const next = boundaries[index + 1];
                const nodes = measure.nodes.filter(node => node.t.compare(time) >= 0 && (!next || node.t.compare(next) < 0));
                return { time, left: Math.min(...nodes.map(leftOf)), right: Math.max(...nodes.map(rightOf)) };
            });
            const costs = new Array<number>(groups.length + 1).fill(Infinity);
            const previous = new Array<number>(groups.length + 1).fill(0);
            costs[0] = 0;
            for (let end = 1; end <= groups.length; end++) {
                let right = -Infinity;
                for (let start = end - 1; start >= 0; start--) {
                    right = Math.max(right, groups[start].right);
                    const width = right - groups[start].left;
                    if (width > contentWidth * 0.94 && start < end - 1) break;
                    const slack = Math.max(0, contentWidth * 0.94 - width);
                    const beat = groups[start].time.clone().sub(timed[0].t);
                    const offBeat = start > 0 && beat.denominator !== 1;
                    const cost = costs[start] + contentWidth ** 2 + slack ** 2
                        + (offBeat ? contentWidth ** 2 : 0)
                        + Math.max(0, width - contentWidth) ** 2 * 100;
                    if (cost < costs[end]) { costs[end] = cost; previous[end] = start; }
                }
            }
            for (let end = groups.length; previous[end] > 0; end = previous[end]) {
                breakColumn(measure.nodes, groups[previous[end]].time);
            }
        }
        // Minimize squared unused space, never compress a normal measure to fit a preceding one.
        const best = new Array<number>(measures.length + 1).fill(Infinity);
        const previous = new Array<number>(measures.length + 1).fill(0);
        best[0] = 0;
        for (let end = 1; end <= measures.length; end++) {
            for (let start = end - 1; start >= Math.max(0, end - 48); start--) {
                const width = measures[end - 1].end - measures[start].start;
                if (width > contentWidth * 0.94 && start < end - 1) break;
                const slack = Math.max(0, contentWidth * 0.94 - width);
                const cost = best[start] + slack * slack + Math.max(0, width - contentWidth) ** 2 * 100;
                if (cost < best[end]) { best[end] = cost; previous[end] = start; }
            }
        }
        const starts: number[] = [];
        for (let end = measures.length; end > 0; end = previous[end]) starts.push(previous[end]);
        for (const start of starts.filter(index => index > 0)) {
            const members = measures[start].nodes;
            const first = members.filter(node => node.mergeKey !== ANCHOR_KEY).reduce((a, b) => a.t.compare(b.t) <= 0 ? a : b);
            // Explicit commands must be inserted into each parallel voice at the same time.
            breakColumn(members, first.t);
        }
    }
    return [...insertions].sort((a, b) => a - b);
}

/** Do not insert a control event inside a single-event duration/grace wrapper. */
function breakPosition(node: ASTNodeBase): number {
    let target = node;
    for (let parent = target.parent; parent; parent = target.parent) {
        if (parent instanceof ASTBraceNode && (parent.children.length === 1
            || parent.parent instanceof ASTFunctionNode && parent.parent.callName === 'tuplet')) target = parent;
        else if (parent instanceof ASTFunctionNode && ['div', 'dot', 'up', 'down', 'grace', 'arp', 'adjust', 'tuplet'].includes(parent.callName)) target = parent;
        else break;
    }
    return target.sourceSpan.start;
}

export function insertAutomaticBreaks(source: string, positions: readonly number[]) {
    const command = ' @br() ';
    let output = '', previous = 0;
    for (const at of positions) { output += source.slice(previous, at) + command; previous = at; }
    output += source.slice(previous);
    const originalOffset = (offset: number) => {
        let shift = 0;
        for (const at of positions) {
            if (offset < at + shift) break;
            if (offset < at + shift + command.length) return at;
            shift += command.length;
        }
        return offset - shift;
    };
    const seen = new WeakSet<object>();
    return { source: output, restore(span: SourceSpan) {
        if (seen.has(span)) return;
        seen.add(span);
        span.start = originalOffset(span.start); span.end = originalOffset(span.end);
    } };
}

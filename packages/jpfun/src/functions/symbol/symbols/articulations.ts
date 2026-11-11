// M3N addition: basic articulation shapes missing from the upstream symbol table.
import type { SymbolDefinition } from '../index.js';

export const articulationSymbols: readonly SymbolDefinition[] = [
    { name: 'staccato', description: '跳音', shapes: [{ circle: { cx: 2, cy: 2, r: 2 }, style: { fill: '#000' } }] },
    { name: 'tenuto', description: '保持音', weight: 0.18, shapes: [{ path: [{ op: 'M', x: 0, y: 0 }, { op: 'L', x: 8, y: 0 }, { op: 'L', x: 8, y: 1.3 }, { op: 'L', x: 0, y: 1.3 }, { op: 'Z' }], style: { fill: '#000' } }] },
    { name: 'staccatissimo', description: '顿音', shapes: [{ path: [{ op: 'M', x: 0, y: 0 }, { op: 'L', x: 5, y: 0 }, { op: 'L', x: 2.5, y: 7 }, { op: 'Z' }], style: { fill: '#000' } }] },
    { name: 'breath', description: '换气记号', shapes: [{ path: [{ op: 'M', x: 4, y: 0 }, { op: 'C', cx1: 7, cy1: 2, cx2: 3, cy2: 7, x: 0, y: 8 }, { op: 'C', cx1: 2, cy1: 5, cx2: 3, cy2: 2, x: 4, y: 0 }, { op: 'Z' }], style: { fill: '#000' } }] },
];

// M3N modification: optional eighth-note flags for metronome beat units.
import type { PathCommand } from "../../render/types.js";
import { pathBounds } from "../../layout/path.js";

/** 已按字号固化的四分音符字形 */
export interface PreparedQuarterNote {
    w: number;
    h: number;
    /** Actual lower ink edge; dense flags can extend below the head baseline. */
    inkBottom: number;
    /** 符干中线到字形左边界的距离；它是这个字形的竖笔，对齐点取这里 */
    stemCenterX: number;
    commands: readonly PathCommand[];
    /** 传给 PathTransform 的等比缩放，倾斜的符头不能被非等比拉伸 */
    scale: number;
}

// 轮廓直接照抄成品字模，坐标单位是 em；y=0 是符干顶端，y=HEIGHT 是符头底端（对齐文字基线）
const GLYPH_EM = 11;
const WIDTH = 3.864;
const HEIGHT = 10.88;
const STEM_LEFT = 3.304;

// Reverse winding cuts a transparent counter out of the head, including on
// colored backgrounds and in Canvas/export backends.
const HEAD_COUNTER: readonly PathCommand[] = [
    { op: "M", x: .65, y: 9.75 },
    { op: "Q", cx: .7, cy: 10.35, x: 1.35, y: 10.2 },
    { op: "Q", cx: 2.1, cy: 10.05, x: 2.75, y: 9.25 },
    { op: "Q", cx: 3.45, cy: 8.4, x: 2.8, y: 8.5 },
    { op: "Q", cx: 1.95, cy: 8.45, x: 1.1, y: 9.15 },
    { op: "Q", cx: .65, cy: 9.5, x: .65, y: 9.75 }, { op: "Z" },
];
const WHOLE_NOTE_COMMANDS: readonly PathCommand[] = [
    { op: "M", x: 6, y: 1.8 },
    { op: "C", cx1: 6, cy1: 4.2, cx2: 0, cy2: 4.2, x: 0, y: 1.8 },
    { op: "C", cx1: 0, cy1: -.6, cx2: 6, cy2: -.6, x: 6, y: 1.8 }, { op: "Z" },
    { op: "M", x: 4.7, y: 2.2 },
    { op: "C", cx1: 4.3, cy1: .1, cx2: 1.1, cy2: -.1, x: 1.3, y: 1.4 },
    { op: "C", cx1: 1.7, cy1: 3.5, cx2: 4.9, cy2: 3.7, x: 4.7, y: 2.2 }, { op: "Z" },
];

const QUARTER_NOTE_COMMANDS: readonly PathCommand[] = [
    { op: "M", x: 3.864, y: 8.5 },
    { op: "Q", cx: 3.864, cy: 9.228, x: 3.5, y: 9.76 },
    { op: "Q", cx: 3.136, cy: 10.292, x: 2.555, y: 10.586 },
    { op: "Q", cx: 1.974, cy: 10.88, x: 1.302, y: 10.88 },
    { op: "Q", cx: 0.826, cy: 10.88, x: 0.413, y: 10.621 },
    { op: "Q", cx: 0, cy: 10.362, x: 0, y: 9.844 },
    { op: "Q", cx: 0, cy: 9.34, x: 0.364, y: 8.899 },
    { op: "Q", cx: 0.728, cy: 8.458, x: 1.288, y: 8.185 },
    { op: "Q", cx: 1.848, cy: 7.912, x: 2.422, y: 7.912 },
    { op: "Q", cx: 2.968, cy: 7.912, x: 3.304, y: 8.094 },
    { op: "L", x: 3.304, y: 0 },
    { op: "L", x: 3.864, y: 0 },
    { op: "Z" },
];

export function prepareQuarterNote(size: number, unit = 4): PreparedQuarterNote {
    const scale = size / GLYPH_EM;
    if (unit === 1) {
        const bounds = pathBounds(WHOLE_NOTE_COMMANDS);
        return { w: bounds.w * scale, h: (bounds.y + bounds.h) * scale,
            inkBottom: (bounds.y + bounds.h) * scale,
            stemCenterX: 3 * scale, commands: WHOLE_NOTE_COMMANDS, scale };
    }
    const flags: PathCommand[] = [];
    const flagCount = Math.max(0, Math.log2(unit / 4));
    for (let flag = 0; flag < flagCount; flag += 1) {
        const y = flag * 2.2;
        flags.push({ op: "M", x: WIDTH, y }, { op: "Q", cx: WIDTH + 5, cy: y + 2, x: WIDTH + 2, y: y + 6 }, { op: "Q", cx: WIDTH + 3, cy: y + 3, x: WIDTH, y: y + 2 }, { op: "Z" });
    }
    const commands = [...QUARTER_NOTE_COMMANDS, ...(unit === 2 ? HEAD_COUNTER : []), ...flags];
    const bounds = pathBounds(commands);
    return {
        w: (WIDTH + (flags.length ? 4 : 0)) * scale,
        h: HEIGHT * scale,
        inkBottom: (bounds.y + bounds.h) * scale,
        stemCenterX: (STEM_LEFT + WIDTH) / 2 * scale,
        commands,
        scale,
    };
}

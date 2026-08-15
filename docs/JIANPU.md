# JianpuRender 本地参考手册

> 适用版本：`jianpurender@1.2.0`（本仓库已安装版本）  
> 更新日期：2026-08-15  
> 用途：供开发 Agent 离线查阅简谱渲染库的能力边界、输入模型与 M3N 适配方式。

## 快速定位

| 目标 | 搜索本页 | 相关 API / 模块 |
| --- | --- | --- |
| 输入数据模型 | `JianpuInfo` | `notes`、`tempos`、`keySignatures`、`timeSignatures` |
| 渲染入口 | `JianpuSVGRender` | 构造时渲染，`redraw(activeNote)` 高亮 |
| 简谱数字换算 | `mapMidiToJianpu` | MIDI 音高 → 数字、八度点、临时记号 |
| M3N 渲染输入 | `ScoreDocument` | `analyzeM3N(source).score` |
| 页面与歌词适配 | `jianpu-score` | `@m3n/score-renderer` 的 `JianpuScore` |

## 1. 范围与边界

JianpuRender 是浏览器端简谱 SVG 渲染库：输入 `JianpuInfo`，输出一行连续的 SVG 乐谱，并把每个时值块写成 `g[data-block-start]`，把每个音符写成 `g[data-id="start-pitch"]`。

- **规范性输入**：`JianpuInfo`，其中音符以四分音符为单位的 `start` / `length` 表示，`pitch` 为 MIDI 音高。
- **原生支持**：音符、休止（音符流中的空白）、附点、时值下划线、高低八度点、升降记号、延音（跨拍/跨小节的长音符自动拆分并画连线）、同拍多音（和弦）、调号与拍号文字、按拍分块。
- **原生不支持**：歌词、分页、反复与跳房子、连音数字、装饰音、奏法/力度记号、小节框选。这些由 `JianpuScore` 适配层在渲染后补齐。
- **播放**：JianpuRender 自身不做音频；M3N 的简谱播放复用五线谱的 Verovio MIDI 与 SpessaPlayer 时间轴，播放高亮通过 `elementsAtTime` 返回的 MEI ID 查询简谱 DOM 实现。

## 2. 输入模型

```ts
type JianpuInfo = {
  notes: Array<{ start: number; length: number; pitch: number; intensity: number }>
  tempos?: Array<{ start: number; qpm: number }>
  keySignatures?: Array<{ start: number; key: number }>   // key = 主音音级 0=C…11=B
  timeSignatures?: Array<{ start: number; numerator: number; denominator: number }>
}
```

`JianpuModel` 会把音符按拍和小节切块；一个跨小节的长音符会拆成两块并建立 `tiedFrom` / `tiedTo` 关系，从而正确绘制延音线。`MeasuresInfo` 根据 `timeSignatures` 计算小节边界，因此**弱起小节可以用一个缩短的布局拍号表示**（例如 2/4 的弱起写成 `numerator: 2` 的一小节，再接回 4/4）。

## 3. 渲染入口

```ts
const renderer = new JianpuSVGRender(info, { noteHeight: 24, noteColor: '#20242b' }, container)
renderer.redraw(activeNote) // 可选：高亮某个音符并滚动
```

构造完成后，`container` 内会生成一个可横向滚动的 `div` 和主 SVG。`#music` 分组包含所有 `g[data-block-start]` 块与小节线；`#signatures` 分组包含调号/拍号文字（适配层会隐藏并用自有标注替代，以便显示真实拍号）。

## 4. M3N 直接渲染

`packages/score-renderer/src/jianpu-score.ts` 的 `JianpuScore` 直接接收 `ScoreDocument`：

- 直接从 `parts`、`ScoreMeasure`、`ScoreEvent` 建立自然宽度系统（旋律行；有低音行时增加第二行）。
- 按与 MEI 相同的事件遍历顺序写入 `m3n-e-N`、`m3n-measure-N-M` 和 `data-source-*`，供现有光标、校验高亮与点击定位复用。
- 补齐歌词、调号/拍号/速度标注、反复线（含点）、跳房子、段落名、反复/跳转记号、连音数字、装饰音、断奏/震音/重音与力度记号。
- 按 A4 比例把连续 SVG 切分为页面，第一页写入乐谱标题头，`attach` 时复用现有 `score-page-sheet` 分页与导出流程。

## 5. 已知限制

- 按「每行排满后换行、每页多行」的方式排版，与五线谱的系统/分页布局一致；断行发生在小节边界，跨系统延音只保留前一行末端的连线弧线。
- 简谱不渲染低音谱表，而是把低音行排成第二行简谱（与五线谱双谱表对应）。
- 和弦标记（`harm`）与多小节休止符号尚未在简谱中绘制；休止仍按整小节 `0` 显示。
- 装饰音按小号数字加斜线处理，不区分主音符是否占时值。

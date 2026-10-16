# M3N 简谱渲染

简谱采用纯浏览器链路：`ScoreDocument → @m3n/numbered-notation → @m3n/jpfun → SVG`。jpFun 的 TypeScript 核心源码已保存在 `packages/jpfun`，固定上游版本与本地补丁；旧的自绘 `core/` 和字形 JSON 已移除。源码来源、Apache-2.0 许可和维护记录见 [UPSTREAM.md](../packages/jpfun/UPSTREAM.md) 与 [CHANGES.md](../packages/jpfun/CHANGES.md)。选型背景见[历史整改方案](NUMBERED_NOTATION_REMEDIATION.md)。

## 调用与职责

```ts
await prepareNumberedNotationFonts()
const score = NumberedNotationScore.create(document)
const pages = score.render({ width: 800, paged: true, includeBass: true })
// score.diagnostics 包含投影与引擎诊断。
```

唯一音乐输入是 `ScoreDocument`；适配器不读取 `document.source`、MEI、Verovio SVG 或 MIDI。`projection.ts` 负责领域语义到 jpFun 脚本的投影，`lyrics.ts` 负责歌词槽位与遍次，`svg.ts` 只添加交互分组和属性，不移动或重新绘制音符与关系线。

简谱显示与导出不初始化 Verovio。播放时才按需加载 Verovio 与 SpessaSynth，继续沿用现有 MIDI、反复与导航时间轴。`@m3n/score-renderer/view` 提供轻量页面工具，`/verovio` 和 `/player` 是独立的动态入口；生产打包不再把 Vite 的共享加载助手放入手工指定的 Verovio 块。渲染库、WASM、字体和音源必须来自本站构建产物，禁止使用第三方运行时资源外链。

应用为当前输入与布局设置分别缓存简谱和五线谱快照，重复切换可直接恢复；修改乐谱、版宽或分页等设置会使缓存失效。文档页切换通过 Context 更新谱例，保留已有组件。

`scoreEventIds(document)` 是 MEI 与简谱共享的事件身份映射。唯一 DOM `id` 与可以重复的 `data-m3n-id` 分开：连音组子音符、长音增时线和长休止保留父事件身份，各自拥有唯一的可视 ID。小节跨系统或跨页时保留逻辑小节 ID，避免重复 DOM ID。歌词另带 `data-m3n-rendition` 和 `data-m3n-passes`，支持点击定位与反复遍次高亮。低音谱表共享旋律的反复小节线，避免并行声部的锚点错位。

## 语义支持

| 范围 | 行为 |
| --- | --- |
| 音高、变音、八度、八度区间 | 投影为 jpFun 数字音符及上下点；每个和音成员应用相同规则 |
| 时值、附点、延音、休止 | 保留精确时值；长音拆为首音与增时线，长休止使用多个 0；多小节休止显示小节数 |
| 和音、低音、多声部 | 交给 jpFun 排列与对齐；导出可排除低音而不改变旋律事件 ID |
| 连音组、倚音、琶音 | 使用原生连音组、复合倚音和琶音；长/短倚音的演奏区别仍由 Verovio MIDI 处理 |
| 延音线、连奏、发夹 | 原生关系附件处理跨行；合并相邻连奏；支持单事件短发夹及文字形式 |
| 装饰、指法、力度 | 延长号、跳音、重音、保持音、断音、换气、颤音、指法与力度均有投影 |
| 调号、拍号、速度 | 显示页头和谱中变化；渐快/渐慢显示文字及目标速度，播放使用现有时间轴 |
| 反复、跳房子、导航 | 反复线、次数、房子括线及 D.S./D.C./Fine/Segno；播放由领域计划与 Verovio 负责 |
| 歌词与文字 | 中文标点、英文词、多行、共享遍次、空槽、延音与间奏跳过；括号词组保留下划线；文字、和弦、段落标题 |

适配器对未映射的后缀产生 `NUMBERED_UNSUPPORTED_MARK`，应用显示提示；引擎错误会终止本次渲染并显示原因。领域层未表达的功能不会通过重新扫描源码补猜。引擎拍号警告仅作参考，M3N 的领域校验继续负责弱起、跨乐句小节和双谱表规则。

## 排版与字体

支持至少 320px 的版宽。分页使用 A4 去掉四边 10mm 后的内容比例 `277 / 190`，连续模式按实际内容扩展高度。页头与正文均由 jpFun 渲染。

通用 `autoWrap` 先以自然宽度布局，再根据包含歌词的实际横向占位平衡小节。密集小节可在音符列间换行，连音组内部不主动拆分；具名乐段、`{br}` 和声部的对应边界保持同步。同一时刻的调号、拍号和速度只在每个声部插入一次换行，跟随后续音符；前反复线归属后一个小节。字形、歌词、连线、装饰和分页由引擎处理，适配器不再对最终横坐标做压缩补偿。

浏览器加载字体后使用 `CanvasTextMeasurer`，离线测试可注入 `textMeasurer`。数字使用原样嵌入的 Liberation Mono Regular（SIL OFL 1.1），同一资源用于测量、显示和 SVG 导出，无 CDN 字体请求；许可见 `public/licenses/liberation`。中文及普通文字使用系统 serif 字体，因此不同系统的文字度量可能不同。

## 导出与验证

预览与最终导出调用相同接口、版宽和字体准备流程。简谱提供 SVG 矢量图、PNG 连续图和 A4 PDF；**PDF 仍是既有的 Canvas/PNG 嵌入路径，并非矢量 PDF**。SVG 内嵌数字字体，可独立保存。

- `npm run test`：保留上游测试与快照；适配器为全部 82 首内置曲目分别建立用例，核对每个事件的音高、变音、八度、开始时间、时值、事件身份、控制记号同行及分页。
- `npm run test:numbered-layout`：不启动服务器，在 Chromium 中检查全部曲库和三个复合谱例的 320/600/800/1000px、连续/分页组合，共 680 次布局，检查真实 SVG 边界及歌词相交，输出 `.tmp/numbered-layout-report.json` 和示例截图。可用 `CHROMIUM_PATH` 指定浏览器。
- `npm run test:numbered-audit`：执行上述检查，并生成逐曲的 800px 连续、320px 分页截图及索引 `.tmp/numbered-audit/index.html`。索引与 `manifest.json` 保留逐曲结果，截图不纳入 Git。
- `npm run test:e2e`：临时构建并启动生产预览，验证无 Verovio 加载的简谱显示、音符/歌词定位、连音组与低音播放、反复歌词、设置与 SVG/PNG/PDF 导出。测试构建设置本地模拟提交，避免依赖分享服务。

几何检查与截图审视提供可重复的基线，不代表对任意乐谱、任意字体组合的完整雕版质量保证。新增音乐语义应先补领域与投影测试，新增通用排版能力应在 jpFun 包中记录补丁并保留上游默认行为。

2026-10-16 逐曲修复与验证记录见 [NUMBERED_NOTATION_AUDIT.md](NUMBERED_NOTATION_AUDIT.md)，包含本轮发现的问题、82 首曲目清单和复现命令。

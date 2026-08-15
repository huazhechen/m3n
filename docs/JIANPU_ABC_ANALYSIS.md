# JianpuABC 对照审计与渲染迁移说明

审计对象：`ChaoXianGaoGuan/jianpu-abc`（GitHub `main`，2026-08-15 通过 API/archive 获取）。

## 项目能力概览

JianpuABC 是一个浏览器无关的 TypeScript 工具链：JABC 解析器先生成保留源码位置的 AST，再经过规范化、节拍分析、音高映射，驱动简谱 SVG、五线谱适配器、ABC/MusicXML 导出和 Web Audio 播放。Web 页面是一个工作台，而不是只读的谱面展示页：编辑器、曲库、简谱/五线谱切换、源码定位、播放控制和图片导出共享同一份解析结果。

## 与简谱绘制无关的优势

| 领域 | 对方优势 | 对 M3N 的改进建议 |
| --- | --- | --- |
| 语法演进 | 头部字段、inline `K/V`、扩展字段均保留；未知字段不会丢失 | 在 `M3NSyntaxTree` 中继续保留未知 directive 的原 token，并提供可扩展 registry，避免每次加语法都改主解析器 |
| 错误体验 | `parseJabc` 返回可恢复的结构化错误，含行列、附近文本、token 和修复建议；不会因一个 token 中止全局解析 | 统一 `ScoreDiagnostic` 的 `messageArgs` 与修复动作，编辑器按 range 显示 quick fix；把“可继续渲染”和“不可渲染”分级 |
| 领域分层 | AST、规范化、节拍、导出、播放、渲染互不依赖 DOM；同一 Score 可导出多种格式 | 保持 `notation -> renderer` 单向依赖；为播放/导出增加显式的 `RenderPlan`/`PlaybackPlan`，禁止 UI 重复扫描源码 |
| 节奏分析 | `Fraction` 精确表示时值；独立 beat-clear 视图把复杂时值转换为可读的拍内划线 | 在 `ScoreDocument` 上增加纯函数节拍视图，简谱和五线谱共享，渲染只消费结果 |
| 编辑器交互 | 光标高亮事件、右键从 SVG 跳回源码；事件 id 贯穿 AST、播放和 SVG | 继续使用 `xmlId/sourceStart/sourceEnd`；补充键盘焦点定位和“当前播放事件 -> 编辑器选择区”的双向 API |
| 页面工作流 | 工作台/曲库/指南分离；曲库支持搜索和分类；预览设置可实时刷新 | 将渲染设置持久化到 URL 或 localStorage，并给导出对话框复用同一设置快照 |
| 导出 | ABC、MusicXML、SVG、PNG 均由同一解析结果生成；导出文件名由曲目元数据稳定推导 | 保持现有 `ScoreExportDialog`，补充简谱 SVG 的字体/尺寸元数据和导出快照测试 |
| 播放 | 纯播放计划先展开反复/跳房子，再交给 Web Audio；支持暂停、恢复、停止、预备拍、独立音量 | 继续复用现有 Verovio MIDI 时间轴；将反复展开结果暴露给简谱高亮，避免两套时间计算 |
| 测试与文档 | 语法、节拍、渲染布局、导出、播放、页面交互均有独立测试和离线文档 | 对每个增强语法添加 notation 转换契约测试及 renderer DOM 契约测试；把限制写入 `docs/JIANPU.md` |

## 对方实现中应谨慎吸收的部分

- 页面脚本集中管理大量全局状态，规模扩大后不利于多实例编辑器；M3N 应继续把状态留在 React 页面/协调器。
- SVG 渲染器通过字符串拼接输出，轻量但容易遗漏 XML 转义和属性类型；M3N 保持 DOM builder，并集中转义文本。
- 对方当前只支持简单三连音、主要调式和有限声部语义；M3N 的 tuplets、低音声部、反复导航和歌词 passes 已更完整，不应为了兼容 JABC 而降级。

## M3N 渲染迁移结果

当前实现位于 `packages/score-renderer/src/jianpu-score.ts`，采用“数据转换 -> 原生 SVG 排版 -> measure/system/page 装饰”的纯浏览器适配边界：

1. `toJianpuScoreData` 与 MEI 共享稳定事件 ID、歌词和延音续音。
2. `JianpuScore.create` 同时排版旋律/低音、按小节断系统、按 A4 高度分页，并在断系统处去除重复起始小节线。
3. 装饰阶段覆盖调号、拍号、速度、歌词、反复/ending、导航、tuplets、grace、力度和奏法；所有 note/measure 都保留源码定位属性。
4. `attach` 与 `pagesClone` 分离页面挂载和导出，避免导出流程重新解析或重排。

后续建议优先级：

1. 增加 beat-clear 简谱显示模式（纯数据变换，不改源码 AST）。
2. 增加渲染设置快照与 SVG 视觉回归测试，覆盖窄宽度、跨系统延音和多行歌词。
3. 将 `JianpuScore` 的装饰绘制拆为可独立测试的 `layout`、`annotations`、`lyrics` 模块；保持公共 `create/attach/pagesClone` API 不变。


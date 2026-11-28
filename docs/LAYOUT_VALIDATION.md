# 布局与墨迹验收

当前纵向规则见[共享纵向间距求解](VERTICAL_SPACING.md)：两种谱式共用M=24px的0.75倍下限，舒适区由下限的1.5～2倍推导；已删除谱源行距指令。行内几何固定；每档选定断行后搜索保持页数的最大统一行距。
生产布局按真实字形和线条几何测量、分行及避让；独立浏览器审计读取最终 SVG，验证墨迹重叠、画布边界及 A4 容量。自动选宽规则见[宽度搜索](WIDTH_SEARCH.md)。

## 共用尺度

标题32px、副标题及歌词16px、署名及注释14.4px，普通字重500。简谱音乐字号M=24px，小节线高度1.25M=30px；五线谱谱间S=7.5px，音乐字号4S=30px。Segno与Coda高度为简谱M的0.75倍，即18px。音乐内部几何按具体字号比例测量；行间与谱头采用[共享纵向规则](VERTICAL_SPACING.md)。

各谱式按自身音乐结构计算硬占宽，歌词按实际墨迹取约束。歌词块之间的最小净空随音乐横向三档取0／1／2px，不在块两侧附加外边距。歌词约束与音乐约束取较大值，剩余宽度在抵扣已有撑开量后按节奏权重伸展，不另设歌词舒适余量，见[歌词间距](LYRIC_SPACING.md)。

## 独立墨迹检查

`tools/lib/native-ink-collisions.mjs` 收集绘制图元并按复合符号归属形成对象。所有独立对象对都经过几何候选筛选，再以2倍分辨率的实际填充及描边确认重叠；未知角色及未标记图元也参加检查。对象类别不决定是否配对，曲线包围盒内部空白、虚线空隙及不可见元素不算墨迹。

复合符号内的部件属于同一对象。绘制端以 `data-m3n-join` 声明有意连接的图元，同一谱行内共享连接身份只豁免这两个图元的连接，不豁免同一音符的其他部件。五线是结构参考线；小节号白底是覆盖层，按各自显示约定处理。不同谱行的整体墨迹独立比较，不跨行复用连接豁免。五线谱适配器只负责现行对象分类。

检测器的类别矩阵及几何测试验证相交反例和分离正例。像素检查验证几何安全；乐谱音高、节奏、歌词、导航和连接语义由领域及谱源回归验证。

## 检查命令

所有重型检查串行执行，单测试 worker，Node 堆受限。`npm run check`、`npm run check:ci` 和 `npm run test:e2e` 自带聚合内存守卫；单独运行其他重检查时使用 `python3 tools/run-low-memory.py <命令>`。工作区上限2GB，默认1700MiB停止，最大可设1800MiB。

- `npm run check`：边界、lint、类型、全部离线测试、生成物校验、隔离构建、全库领域投影、双谱式代表谱例、谱集浏览器、真实字体密度、实际字体子集与完整字库取样、核心页面端到端门禁。
- `npm run check:ci`：与 GitHub 工作流相同的生成物、检测器和真实字体密度门禁。
- `npm run test:tools`：自动发现离线工具测试；浏览器检查分阶段执行，字体子集及完整字库取样属于离线检查。
- `npm run test:native-ink`：兼容入口，复用CI门禁的双谱式最终墨迹与检测器回归。
- `npm run test:staff-layout`：兼容入口，运行共用的双谱式真实字体密度及墨迹回归；不再重复全库渲染。
- `npm run test:notation-density`：真实字体双谱式回归，校验物理尺度、连续高度、行数及墨迹安全。
- `node tools/compare-notation-density.mjs --all --widths=640`：全库同宽双谱式检查；`--screenshots`、`--pdfs` 保存实绘，`--profile` 输出逐行／逐小节诊断。
- `node tools/compare-optimal-notation-pages.mjs`：两种谱式分别完整选宽后检查页数与墨迹。
- `node tools/verify-numbered-font-design.mjs`：简谱设计度量在Chromium／WebKit、桌面／平板模拟中的候选评分与几何一致性，小节号显隐不变性，PNG／PDF显式样式及最终墨迹审计。
- `node tools/review-numbered-widths.mjs`：逐曲核对真实阅读器，并完整枚举41档同页更大字体候选；选定替代方案另作墨迹审计。
- `npm run check:score-artifacts`：生成物摘要一致性。

验证流程由 `tools/verify-project.mjs` 统一编排，阶段耗时写入 `.tmp/verification-<mode>.json`。离线阶段已通过时，可用 `python3 tools/run-low-memory.py node tools/verify-project.mjs integration` 单独重跑包含构建的全部集成检查；非E2E和E2E分别按120秒硬预算验收，详见[测试去重](VALIDATION_REFACTOR.md)。全库多宽、多模式SVG审计已删除：全库音乐内容和事件完整性由领域契约及轻量投影验证；浏览器只对5份代表性输入验证双谱式的真实字体、墨迹、密度及显式换行。需要逐曲诊断时才手动运行 `compare-notation-density.mjs --all`。端到端按文件释放浏览器。审计、导出与 Playwright 共用 `tools/lib/chromium-options.mjs`：本地及CI默认使用已安装的 Playwright 配套浏览器，`CHROMIUM_PATH` 可显式覆盖，禁用单进程模式。

密度门禁约束高度、行数上限、音乐及歌词物理尺寸、事件完整性和实际墨迹。普通 `---` 允许自动重排，不固定历史行数或要求整个乐句始终同排；《基本功》专项检查显式 `{br}` 指定的小节行末边界。检查拒绝非有限数值及空布局，不允许无效统计绕过上限。

简谱无时值间距系数采用1时，《过火》在640px下为10行／1页，连续高度736px，实际墨迹无越界或碰撞；行数上限由9更新为10，高度上限760px及其余检查保持原值。

`--metrics-only` 只适合测量，不作为墨迹验收。检查报告和图像写入忽略的 `.tmp/`；CI 保存报告与失败日志。显示展开量不同的曲目仍参与安全与页数检查，按事件数归一的统计单独处理。

同页更大字体的逐曲分析见[简谱选宽全量复查](NUMBERED_WIDTH_REVIEW.md)。完整枚举和生产验证分开执行；当只调整搜索配置、评分及实际几何不变时，可用 `--verify-baseline=<完整枚举report.json>` 复用41档候选，并重新运行每首生产搜索、核对实际网页、审计选中及替代方案。该模式校验谱源、TTF摘要，以及重新测量的页数、断行、逐间隔统计和各评分分量，报告保留引用基线及代码包摘要。

建议使用 `python3 tools/run-low-memory.py node --expose-gc --max-old-space-size=192 tools/review-numbered-widths.mjs`；驱动按曲关闭整个浏览器并回收临时传输数据。`--resume` 仅接受相同工具、字体、谱源和引用基线。浏览器失败应保留失败；`--record-reader-errors` 仅用于诊断收集，最终验收不使用此开关。

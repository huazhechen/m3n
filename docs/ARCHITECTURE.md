# M3N 前端架构

## 目标

本项目的核心资产不是页面，而是 M3N 语法、转换正确性和乐谱交互。架构以纯领域逻辑为中心，React 页面只负责组合功能和管理界面状态。

依赖方向必须保持单向：

```text
web app -> @m3n/score-renderer -> @m3n/notation
       \-> @m3n/numbered-notation -> @m3n/jpfun
       |                       \-> @m3n/notation
       \-> @m3n/notation
       \-> React / routing / application services
```

`@m3n/notation` 不得依赖 React、DOM、具体页面或 `@m3n/score-renderer`。转换函数应保持确定性：相同输入总是产生相同输出与诊断。
同一编辑操作的派生计算应复用已解析的领域文档，避免各模块重新扫描相同源码。

领域层明确使用两个模型：

- `M3NSyntaxTree` 是无损且可容错的语法模型，保留原始行、token 与绝对源码范围，服务格式化、诊断和编辑器定位。
- `ScoreDocument` 是规范化音乐语义模型，不承载排版空白等文本细节，服务校验、播放计划与 MEI 序列化。

交互调用方通过 `analyzeM3N` 建立一次分析会话并消费其派生结果，不应在同一次编辑更新中自行重复解析。

分析会话直接提供 `diagnostics`；`interaction` 独立提供源码映射、歌词分配、页头和低音存在性，不生成 XML。`getMei()` 与兼容的 `conversion` 在首次读取时才生成并缓存 MEI，复用同一份交互数据与校验结果。纯简谱显示不做 MEI 序列化。元数据提取消费语义文档和诊断，不生成 MEI。初始设置从语法树首音之前的状态指令建立，信息字段仅来自文档首部，注释不参与解析。

结构投影、领域 builder 与源码规则复用语法树中的原始 token，保留绝对位置和 CRLF 偏移，不拼接正文后重新分词。`analyzeM3NSnapshot` 返回可结构化克隆的数据；`restoreM3NAnalysis` 恢复延迟转换入口。可编辑页面通过 `useM3NAnalysis` 在模块 Worker 中分析后续输入，一次只运行一个请求并保留最新待处理编辑；过时响应不能替换当前结果。中文组合输入期间保留原预览并暂停分析，等待更新时禁用播放，线程错误有重试入口；只读文档谱例使用同步分析，不为每个示例创建线程。

## Workspace 边界

- `packages/notation`（`@m3n/notation`）：无平台依赖的语法、领域模型、诊断、格式化、分析和 MEI 转换；可独立生成 JavaScript 与类型声明。
- `packages/score-renderer`（`@m3n/score-renderer`）：浏览器渲染、播放、导出与资源调度；只通过 `@m3n/notation` 的公共入口访问领域类型。
- `packages/numbered-notation`：领域文档到 jpFun 的语义投影、歌词遍次和 SVG 交互适配。
- `packages/jpfun`：固定版本的第三方简谱核心源码，负责通用排版和绘制。
- `src`：React Web 应用、路由、曲库装载及分享服务；通过包名消费子包，不跨入其内部目录。
- `worker`：部署边缘入口，不依赖 Web UI。

包依赖为 `score-renderer -> notation`、`numbered-notation -> notation / jpfun`。jpFun 不依赖 M3N 类型。根应用可以组合这些包，但子包不得反向导入根应用。每个包在自身 `package.json` 中声明运行依赖，并提供独立的 `build`、`test`、`typecheck` 命令；根脚本显式按依赖顺序执行。

## 内部职责

- `packages/notation/src/notation/syntax-tree.ts`：无损容错语法树、行节点与源码范围。
- `packages/notation/src/notation/syntax-rules.ts`：直接消费 directive AST 节点的区间闭合与指令值规则。
- `packages/notation/src/notation/score-document.ts`：规范化乐谱、声部、小节、事件、歌词和演奏区间契约。
- `packages/notation/src/notation/analysis.ts`：交互调用方的统一分析入口。
- `packages/notation/src/notation/diagnostics.ts`：结构化诊断契约；规则在产生诊断的位置直接提供稳定 code、严重级别和源码范围，不保留字符串诊断模式。
- `packages/notation/src/notation/m3n-primitives.ts`：调号、音符和时值等最小语法内核。
- `packages/notation/src/notation/repeats.ts`：反复次数、跳房子及 D.S./D.C. 的纯播放计划；Direct、MEI 和歌词对位共享其语义。
- `packages/notation/src/notation/score-rules.ts`：只消费 `ScoreDocument` 的音乐语义规则；负责小节时值、延音目标和双谱表对齐。
- `packages/notation/src/m3n-direct.ts`：从源码构造 `ScoreDocument`；领域消费者统一使用 `Score*` 类型，不再暴露旧 `Direct*` 类型。
- `packages/notation/src/m3n-lyric-alignment.ts`：以已解析文档为输入的书写小节歌词目标和强制延音目标语义，供格式化与校验共享。
- `packages/notation/src/m3n-validate.ts`：语义校验，只依赖最小语法内核。
- `packages/score-renderer/src`：播放段落展开、导出文档与 Verovio 画布适配。
- `packages/numbered-notation/src`：`ScoreDocument` 到 jpFun 的投影与 SVG 事件适配；实际排版在 `packages/jpfun`。
- `packages/notation/src/m3n-mei.ts`：M3N 到 MEI 中间文档、稳定 `xml:id` 与源码映射。
- `packages/notation/src/notation/mei-xml.ts`：MEI XML 转义与时值属性序列化。
- `packages/notation/src/notation/mei-lyrics.ts`：歌词、下划线、CJK 补偿和 verse 序列化。
- `packages/notation/src/notation/mei-document.ts`：通过 XML builder 组装 MEI 文档头、责任者元数据、`scoreDef` 和 section，统一处理文本转义与文档序列化。
- `packages/notation/src/notation/mei-layout.ts`：MEI section、ending 和 expansion 布局序列化。
- `packages/notation/src/notation/section-order.ts`：校验显式乐段顺序；ScoreDocument 保存分段范围与局部访问次数，MEI expansion、歌词映射和两种谱面共用该模型。
- `packages/score-renderer/src/playback-score.ts`：仅提供 MIDI 生成和时间映射，按播放操作动态加载。
- `packages/score-renderer/src/spessa-player.ts`：SpessaSynth 播放，默认使用本地生成的合成音色；钢琴、口琴通过独立 SF3 按需加载。
- `packages/score-renderer/src/playback-tones.ts`：轻量音色目录、下载去重、浏览器 Cache Storage 持久缓存与失败重试；不初始化合成器或下载未选音色。
- `packages/score-renderer/src/playback-coordinator.ts`：显式管理多个乐谱实例间的播放互斥。
- `lib/render-score.ts`：屏幕、打印预览和最终导出的统一排版入口，负责引擎选择、串行调度、取消、分页和 SVG 后处理。
- `components/ScoreRenderer.tsx`：独立管理布局、播放和光标生命周期；改变版宽或谱式不销毁播放器，更新音乐文档时释放旧播放资源。
- `components/ScoreControls.tsx`：常驻四行控制面板，前三行依次为进度、BPM速度、宽度滑条，各自占满整栏；第四行从左到右为节拍器、钢琴、分页、小节号（按钮文字“行号”）开关和移调控件。进度旁为播放按钮，速度旁还原乐谱原速，宽度旁还原该曲在 `scorebook/layout-record.json` 中的最终版宽；未入谱集时使用谱集默认版宽。桌面与移动端保留相同结构，窄容器缩小间距并使用图标按钮。三个数值只读，均通过滑条调整；BPM支持10–240整数。合成音色默认无需下载，钢琴首次选择时下载并缓存；旧口琴设置回退到合成音色。音色通过 `hooks/usePlaybackTone.ts` 同步阅读页、编辑页、文档谱例与同源标签页，长期保存在localStorage；小节号、速度、宽度、移调与节拍器也保存到本地。小节号默认关闭，开启后按书写顺序在主旋律后小节线上方显示，不改变MIDI或播放顺序。
- `components/ScoreExportDialog.tsx`：打印参数、预览与下载状态；两种谱式均提供连续 SVG、PNG 与多页矢量 PDF。打印宽度单独持久化。
- `lib/vector-export.ts`：把 SVG 文字按字符位置转为 OpenType 字形路径；数字沿用内嵌 Barlow，文字使用按需加载的本地 Noto Serif CJK SC。字形缺失明确报错。
- `components/SourceEditor.tsx`：CodeMirror 编辑适配，提供高亮、行号、括号匹配、指令补全、历史与范围诊断；领域层不依赖编辑器。
- `components/EditorSplit.tsx`：手机源码／预览标签切换，桌面拖动及方向键调整分栏，切换保留输入与分析。
- `pages`：路由级组合，不承载领域算法。
- `scores/*.m3n`：曲库正文的唯一来源；`tools/score-catalog-plugin.ts` 在构建时生成排序后的虚拟索引，`lib/samples.ts` 只消费索引并按曲目异步加载正文，浏览器不逐首解析内置曲库。`lib/score-order.ts` 按标题拼音或英文字母 A–Z 排序，本地与内置曲目共用该规则。
- `hooks/useScoreSource.ts`：编辑页、阅读页共用的来源加载与失效请求取消；缺失和失败有明确页面状态，不替换成默认谱。
- `hooks/useScoreDraft.ts`：草稿恢复、延迟保存与离开页面时写入；本地正式保存更新原 ID，持久化失败不得返回成功。
- `hooks/useM3NAnalysis.ts` 与 `lib/analysis-client.ts`：编辑分析的合并、版本检查与线程生命周期；不把 Worker 通信逻辑放入领域包。
- `notation/harmony-syntax.ts`：和弦符号的共享定义；和弦行解析、校验与 MEI 符号生成复用它，最长后缀优先匹配。

## 渲染资源与切换

默认部署在 `/`；设置 `VITE_BASE_URL=/score/ npm run build` 可部署到子路径。React Router 的 `basename`、站点图标、导出字体和分享 API 均使用同一构建基路径，Vite 负责处理模块、WASM 和音源 URL。宿主应对该前缀下的页面路由返回 `index.html`，并把 `/score/api/*` 转给现有 Worker（转交前去掉 `/score` 前缀）；存储继续实现 `M3N_SCORES` 的 KV 接口。

钢琴和口琴 SF3 音源保存在 `packages/score-renderer/vendor/soundfonts`，轻量 `/tones` 入口通过 `?url` 导入，Vite 构建时输出带内容哈希的 `/assets/FluidR3_GM-{Piano,Harmonica}-*.sf3`。默认 `synth` 音色由 `synthetic-soundfont.ts` 在内存中生成短周期波形，无需请求音源文件，继续使用同一套 MIDI、速度、移调与节拍器逻辑。选择 `piano` 或 `harmonica` 时立即按需下载对应文件，显示加载状态、错误与重试；播放中切换音色时继续使用当前音色，下载并解码完成后切换音源优先级，后续音符使用新音色，已发声音符自然结束；不重建播放器、不暂停或跳转。移调通过合成器系统调音实时更新当前与后续音符，打击乐保持原调，不重建MIDI。旧请求不能覆盖更新后的选择。

音源同时保存在页面内存和 `m3n-soundfonts-v1` Cache Storage，以完整哈希 URL 为键；刷新后先读缓存，不重新下载。存储不可用或配额不足时允许正常加载并保留内存副本，网络失败不缓存，损坏缓存重新下载。浏览器清理站点数据可能移除缓存和选择。`public/_headers` 为 `/assets/*` 配置 `Cache-Control: public, max-age=31536000, immutable`，由 Cloudflare 静态资源服务应用；音源更新时哈希 URL 自动变化。HTML 和不带哈希的公共文件不使用此长期缓存规则。

该音源只保留 GM Program 0 的 Yamaha Grand Piano。精简版将原来的 40 个左右声道采样合成为 20 个单声道采样，以 Ogg Vorbis quality 1 编码；保留原始 32 kHz 采样率、音区、力度映射和延音循环。文件由 1,365,672 字节降至约 357 KB，代价是立体声空间感和部分编码细节，单声道合成后的响度也可能略低。播放器入口与缓存策略不变。

钢琴重建命令为 `npx tsx tools/build-fluidr3-piano-sf3.ts <原始钢琴.sf3或完整FluidR3_GM.sf2> [输出路径]`，默认输出到上述 vendor 文件；输入与输出必须分开保存。编码环境需要 Python 3 与支持 Vorbis 的系统 libsndfile（`tools/encode-vorbis.py`），钢琴脚本也支持通过 `FFMPEG_PATH` 指定支持 libvorbis 的 FFmpeg。脚本不再依赖 `.tmp/SpessaSynth` 源码；写入前会重新解码全部采样并校验循环边界。使用完整 SF2 时可先执行 `npm run download:fluidr3` 获取源文件，下载保存在 `.tmp/soundfonts`，避免将完整版随站点发布；不同 Vorbis 编码库版本的产物大小可能略有差异。

口琴通过 `node tools/build-fluidr3-harmonica-sf3.mjs [完整FluidR3_GM.sf2或FluidR3Mono_GM.sf3] [输出路径]` 提取：从 Bank 0 / Program 22 复制 Harmonica，保留采样率与循环，以 Vorbis quality 1 编码，独立文件中的 Program 改为 0，适配乐谱现有 MIDI。默认来源是 MuseScore v2.3.2 随附的 FluidR3Mono 2.312（FluidR3 GM 的单声道发行版），以 Git blob 哈希固定并验证输入。完整源库只用于构建，网站仅发布提取后的口琴文件。原作者信息与 MIT 许可证保存在 `vendor/soundfonts/FluidR3Mono-LICENSE.md`，并写入口琴文件的元数据。

口琴文件为 47,932 字节，包含 8 个采样。原始映射只覆盖到 MIDI 96；提取时将最高采样的音区延伸到 MIDI 127，避免高音或移调后无声。常用音区的采样映射不变。

生产渲染资源必须随本站发布，禁止使用第三方 CDN 或远程渲染资源 URL。Verovio 使用固定 6.2.0 版本的本地精简构建，保留的字体资源嵌入独立 WASM，JavaScript 通过模块相对 URL 加载它；npm 包仅提供同版本 toolkit 包装器。默认和回退音乐字体都固定为完整 Leipzig；Bravura 只保留初始化需要的符号名称与度量 XML，移除未使用的字形和 CSS。构建脚本还裁掉未使用的输入格式，源码、许可证、裁剪清单和重建方法见 [Verovio 构建说明](VEROVIO_BUILD.md)。jpFun 与数字字体也由本地构建提供。Cloudflare 的 `ASSETS` 绑定负责提供 `dist`，浏览器只请求本站 `/assets/*`；音源与 AudioWorklet 同样来自本站。文档中的参考链接和 SVG 的命名空间不是资源加载路径。

冷启动需要下载并解析渲染包，再初始化 WASM 或准备字体。Verovio 经资源、输入格式、内部编辑器和接口裁剪，再配合跨文件优化与独立 WASM，生产 JS 与 WASM 合计由最初约 7.91MB 降到 3.04MB；分别压缩后合计 gzip（level 9）约 0.99MB，Brotli（quality 11）约 0.76MB。这些数字描述构建产物，不代表线上实际传输大小。模块与 WASM 初始化在当前页面内复用，切换谱式不应重复下载；纯简谱显示不请求 Verovio JS 或 WASM。

`ScoreRenderer` 在编辑或布局参数变化时更新简谱排版。播放实例按需加载并独立销毁。

文档页所有谱例均使用简谱。加载状态分为渲染库、字体准备与排版。

阅读默认采用连续布局并按容器重新排版，保留可读字号；分页的纸张装饰在适应阅读宽度时简化。移动端（≤720px）移除渲染卡片边框、内边距和分页纸张阴影；阅读页保留屏幕两侧9px留白，谱内保留默认32px页边距；白底分页之间以16px透明间隔露出页面底色，保留分页及宽度设置。阅读宽度通过常驻滑条调整，打印版宽使用单独的 `m3n:print-width`。共享排版入口将每页 Verovio 内层 SVG 的尺寸明确为外层 viewBox 的坐标尺寸，避免 PDF 转换器把后续页的默认百分比尺寸解释为打印视口而二次缩放。

播放设置不再提供选中小节播放、A–B 循环、声部静音和播放跟随，播放器同步移除循环和声部静音接口。速度以滑条在10–240整数BPM之间逐一调整；一拍与谱面拍速和节拍器一致，按初始拍号分母计拍。例如 6/8、80 qpm 的原速为 160 BPM。播放器按目标 BPM 与 MIDI 初始拍速的比率调整时间轴，保留谱中变速的相对关系，节拍器与预备拍同步。首次未调整时采用谱面原速（超出范围时截到边界），手动值使用新键 `m3n:playback-bpm` 持久化，不读取旧百分比速度。速度还原清除此覆盖值，不改变其他开关。

首次播放仍需要动态加载 Verovio/WASM 生成 MIDI，并初始化 AudioWorklet；合成音色仅免去音源采样下载。MIDI 准备和音频播放器模块加载并行执行；同一乐谱的播放器与渲染工具在页面内复用。

导出字体约 16 MB，只在下载时从本站加载。SVG 和 PDF 的文字转为轮廓以保存中文及字形；文字不再可选择或搜索。PNG 使用相同轮廓生成。字体来源、许可证、校验值与重建脚本见 `public/licenses/noto-serif/`。

`tests/e2e/render-resources.spec.ts` 在阻断所有外站 HTTP 请求的条件下验证显示、切换和播放，检查渲染模块和独立 WASM 各只请求一次、谱例节点保留，以及编辑和版宽变化后的缓存失效。测试附件记录本机冷启动与切换耗时，性能数字不作为设备或网络的固定门槛。

## 质量门禁

提交前执行 `npm run check`，依次完成 AST 导入边界检查、lint、各包严格类型检查、包级与应用级测试、生产构建和端到端测试。测试分三层：

1. 基础语法单元测试，覆盖音符、时值、调号和行式歌词、低音对位。
2. 转换契约测试，覆盖往返、诊断和源码映射。
3. 全量内置乐谱语料测试，防止真实乐谱在重构后无法转换。

`tools/check-boundaries.mjs` 检查静态／动态 import 的包边界、依赖声明与公共入口；notation 类型检查不引入 DOM 库。已修复的回归必须先有失败测试。第三方库细节应封装在 feature 或 component 边界，不得渗入 notation 内核。

## 继续维护时的约束

- 新语法同时验证领域、MEI 与简谱投影，公共转换 API 保持兼容。
- 原文只在分析边界分词；元数据、诊断、格式化和交互消费已有模型。不要在界面组件中追加指令正则解释器。
- 播放顺序及遍次使用 `notation/repeats`；谱式特有的歌词行视觉标签由各适配器维护。
- 不将 SVG 坐标或具体编辑器对象放进领域模型，不为缩短文件制造单行转发层。

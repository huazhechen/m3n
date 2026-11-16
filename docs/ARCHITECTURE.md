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

格式化器将乐谱中指令值以外的连续空白规范为一个空格，删除音乐行开头或连续小节线产生的空音乐小节，并依据旋律对位目标重建歌词小节线；没有歌词目标的小节仍保留为空歌词小节，例如 `甲乙 | | 丙丁`。格式化保留逐个音符、延音、休止符与手动换行，按等价括号分组、布局和歌词对齐分阶段执行，模块职责与规则见[格式化器](FORMATTING.md)。此为编辑器格式化行为，原始输入的语法与校验规则见[手册](MANUAL.md)。

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
- `packages/score-renderer/src`：自研 MIDI 写入、时间索引、音频播放和导出文档。
- `packages/numbered-notation/src`：`ScoreDocument` 到 jpFun 的投影与 SVG 事件适配；实际排版在 `packages/jpfun`。
- `packages/notation/src/m3n-mei.ts`：M3N 到 MEI 中间文档、稳定 `xml:id` 与源码映射。
- `packages/notation/src/notation/mei-xml.ts`：MEI XML 转义与时值属性序列化。
- `packages/notation/src/notation/mei-lyrics.ts`：歌词、下划线、CJK 补偿和 verse 序列化。
- `packages/notation/src/notation/mei-document.ts`：通过 XML builder 组装 MEI 文档头、责任者元数据、`scoreDef` 和 section，统一处理文本转义与文档序列化。
- `packages/notation/src/notation/mei-layout.ts`：MEI section、ending 和 expansion 布局序列化。
- `packages/notation/src/notation/section-order.ts`：校验显式乐段顺序；ScoreDocument 保存分段范围与局部访问次数，MEI expansion、歌词映射和两种谱面共用该模型。
- `packages/score-renderer/src/native-playback-score.ts`：仅提供 MIDI 生成和时间映射，按播放操作动态加载。
- `packages/score-renderer/src/spessa-player.ts`：SpessaSynth 播放，默认使用本地生成的合成音色；钢琴、口琴通过独立 SF3 按需加载。
- `packages/score-renderer/src/playback-tones.ts`：轻量音色目录、下载去重、浏览器 Cache Storage 持久缓存与失败重试；不初始化合成器或下载未选音色。
- `packages/score-renderer/src/playback-coordinator.ts`：显式管理多个乐谱实例间的播放互斥。
- `lib/render-score.ts`：屏幕、打印预览和最终导出的统一排版入口，负责引擎选择、串行调度、取消、分页和 SVG 后处理。
- `components/ScoreRenderer.tsx`：独立管理布局、播放和光标生命周期；改变版宽或谱式不销毁播放器，更新音乐文档时释放旧播放资源。播放高亮只同步音符和源码选区，不滚动页面或源码编辑器；点击音符、诊断等显式定位操作仍可滚动。
- `components/ScoreControls.tsx`：阅读页、编辑页与转换页使用固定在窗口底部的悬浮播放条，从左到右为播放／暂停、进度滑条和节拍器开关；旁边的设置悬浮按钮打开原生非模态 popover。设置弹层含速度、宽度两条滑条及钢琴、分页、固定调、小节号、调号五个按钮，各按钮统一显示图标与文字，调号以当前调性为图标，附“调号”文字。点击空白或 Escape 关闭设置，五度圈作为设置内的模态对话框，关闭后回到调号按钮。弹层不占文档流，开关不改变谱面尺寸或播放实例；悬浮条通过 portal 放到 body，避免渲染容器截断或改变固定定位，页面底部按播放条尺寸动态预留空间及设备安全区。文档谱例沿用同款播放条（播放／进度／节拍器），不显示设置按钮，在各自乐谱渲染区域顶部吸附，滚出该谱例后随之离开。界面统一以 `min(100vmin / 32, 24px)` 为视觉尺寸基准（视口窄边的1/32，最大24px）；顶部导航、品牌标志、编辑操作、播放和设置图标均采用该尺寸。按钮基础边长为基准的2倍且至少32px，顶部栏高为按钮边长加基准的1/2；间距以基准的1/4派生，控件文字为基准的3/4且至少12px。滑条交互区与按钮等高、轨道高为基准的1/8；设置功能按钮另加文字空间，底部留白和设置弹层位置随控件尺寸变化。渲染器与原控制区均无卡片边框及内边距。顶部操作直接在栏内展开，不使用折叠菜单。乐谱阅读页从左到右为上一曲、下一曲、打印、编辑、乐谱库；桌面端使用图标与文字，移动端（≤720px，或主要输入为粗指针且不支持悬停）只显示按统一尺寸基准派生的等宽图标按钮，保留可访问名称与悬停提示。首页、指南和手册顶部只显示乐谱库；移动端页面顶部留白为尺寸基准的1/4，导航栏按统一尺寸基准派生。三个数值只读，均通过滑条调整；BPM支持10–240整数。合成音色默认无需下载，钢琴首次选择时下载并缓存；旧口琴设置回退到合成音色。音色通过 `hooks/usePlaybackTone.ts` 同步阅读页、编辑页、文档谱例与同源标签页，长期保存在localStorage；固定调记谱、小节号与节拍器也保存到本地。移调、速度和宽度只在当前乐曲页面内调整，切换乐曲或重新打开时恢复原调、该曲原速及谱集默认版宽，不读取旧的全局移调／速度／宽度缓存。小节号默认关闭，开启后按书写顺序在主旋律后小节线上方显示，不改变MIDI或播放顺序。文档谱例提供播放／暂停、进度滑条与节拍器，节拍器默认关闭且仅在该谱例临时切换；固定使用合成音色和谱面原速，关闭移调、小节号及分页，不读取这些个人偏好；文档页面统一取视口窄边的1/32作为目标音符字号，最大24px，再根据文档可用宽度与引擎原始22px字号反算排版宽度（引擎最小版宽320px）；所有谱例先按该宽度重新排版，再缩放至容器全宽；窄屏不提供横向滚动，播放栏按同一视口尺寸基准独立布局，不缩放整个DOM；正文尺寸不参与谱面缩放。
- `components/ScoreExportDialog.tsx`：预览与下载状态；复用阅读页当前版宽、速度、移调、固定调、小节号与分页，只提供横排SVG、PNG、PDF三个下载按钮，不再单独设置宽度或低音谱表。
- `lib/vector-export.ts`：把 SVG 文字按字符位置转为 OpenType 字形路径；数字沿用内嵌 Barlow，文字使用按需加载的本地 Noto Serif CJK SC。字形缺失明确报错。
- `components/NotationEditor.tsx`：顶部仅保留格式化、保存、分享三个操作，桌面显示图标与文字，移动端显示按统一尺寸基准派生的等宽图标按钮并保留可访问名称；不显示浏览器保存提示、文件导入／下载或 MEI 入口，草稿恢复与自动保存继续生效。
- `components/SourceEditor.tsx`：CodeMirror 编辑适配，提供高亮、行号、括号匹配、指令补全、历史与范围诊断；领域层不依赖编辑器。
- `components/EditorSplit.tsx`：手机源码／预览标签切换，桌面拖动及方向键调整分栏，切换保留输入与分析。
- `pages`：路由级组合，不承载领域算法。
- `scores/*.m3n`：曲库正文的唯一来源；`tools/score-catalog-plugin.ts` 在构建时生成排序后的虚拟索引，`lib/samples.ts` 只消费索引并按曲目异步加载正文，浏览器不逐首解析内置曲库。乐谱库先显示本地作品，按最近修改时间倒序排列（旧记录缺少修改时间时使用创建时间）；官方曲目随后，使用 `lib/score-order.ts` 按标题拼音或英文字母 A–Z 排序。搜索沿用此顺序，不再提供或记录“最近编辑”。
- `hooks/useScoreSource.ts`：编辑页、阅读页共用的来源加载与失效请求取消；缺失和失败有明确页面状态，不替换成默认谱。
- `hooks/useScoreDraft.ts`：草稿恢复、延迟保存与离开页面时写入；本地正式保存更新原 ID，持久化失败不得返回成功。
- `hooks/useM3NAnalysis.ts` 与 `lib/analysis-client.ts`：编辑分析的合并、版本检查与线程生命周期；不把 Worker 通信逻辑放入领域包。
- `notation/harmony-syntax.ts`：和弦符号的共享定义；和弦行解析、校验与 MEI 符号生成复用它，最长后缀优先匹配。

乐谱库顶部仅保留同一行的“乐谱库”标题和搜索框。搜索支持曲名与署名等文本，以及词／歌词、低／低音、本地、内置、调号和拍号；空格分隔的多个条件同时满足，调号与拍号精确匹配，避免 G 命中其他调性或英文曲名。移动端（≤720px，或主要输入为粗指针且不支持悬停）自动使用紧凑列表，歌名与元信息居中并隐藏署名；桌面端使用普通卡片。词、低与调号、拍号、速度统一显示在歌名下方的标签区域，不提供下拉筛选或紧凑切换按钮。

## 渲染资源与切换

默认部署在 `/`；设置 `VITE_BASE_URL=/score/ npm run build` 可部署到子路径。React Router 的 `basename`、站点图标、导出字体和分享 API 均使用同一构建基路径，Vite 负责处理模块、WASM 和音源 URL。宿主应对该前缀下的页面路由返回 `index.html`，并把 `/score/api/*` 转给现有 Worker（转交前去掉 `/score` 前缀）；存储继续实现 `M3N_SCORES` 的 KV 接口。

钢琴和口琴 SF3 音源保存在 `packages/score-renderer/vendor/soundfonts`，轻量 `/tones` 入口通过 `?url` 导入，Vite 构建时输出带内容哈希的 `/assets/FluidR3_GM-{Piano,Harmonica}-*.sf3`。默认 `synth` 音色由 `synthetic-soundfont.ts` 在本地生成柔和FM电钢琴：保留1:1调制的柔和琴体，移除14:1金属泛音层；补入温和的第2至第5次整数泛音，并随音区升高平滑削弱高频，以改善小扬声器上的清晰度；约750ms内过渡到保留低次泛音的柔和持续声；采用12ms起音和180ms释音，取消延音阶段和初始输出的额外衰减，采样峰值归一化至0.75以提高响度。八个音区各有轻／重两层力度，较重力度的起音更明亮；各音区按最高音限制谐波，循环区保留完整周期。约690KB的SF2只在内存中生成并缓存，传入AudioWorklet时复制缓冲区，不下载音源文件，也不增加部署的音源文件；沿用现有MIDI、速度、移调和节拍器。选择 `piano` 或 `harmonica` 时立即按需下载对应文件，显示加载状态、错误与重试；钢琴按钮下载期间显示“加载中”与旋转图标，准备完成后才显示选中；播放中切换音色时继续使用当前音色，下载并解码完成后切换音源优先级，后续音符使用新音色，已发声音符自然结束；不重建播放器、不暂停或跳转。移调通过合成器系统调音实时更新当前与后续音符，打击乐保持原调，不重建MIDI；同时更新谱面调号，固定调模式按移调后的实际音高重新显示数字与升号。旧请求不能覆盖更新后的选择。

音源同时保存在页面内存和 `m3n-soundfonts-v1` Cache Storage，以完整哈希 URL 为键；刷新后先读缓存，不重新下载。存储不可用或配额不足时允许正常加载并保留内存副本，网络失败不缓存，损坏缓存重新下载。浏览器清理站点数据可能移除缓存和选择。`public/_headers` 为 `/assets/*` 配置 `Cache-Control: public, max-age=31536000, immutable`，由 Cloudflare 静态资源服务应用；音源更新时哈希 URL 自动变化。HTML 和不带哈希的公共文件不使用此长期缓存规则。

该音源只保留 GM Program 0 的 Yamaha Grand Piano。当前发布文件恢复为原始1,365,672字节版本，保留40个左右声道采样、32kHz采样率、音区、力度映射与延音循环，不再使用后续357KB单声道重编码版本。仍在选择钢琴时下载，内容哈希URL变化后自动下载新版并缓存。

`tools/build-fluidr3-piano-sf3.ts` 与 `tools/encode-vorbis.py` 保留为历史压缩实验工具，不用于重建当前发布的原始钢琴文件；原始文件可从Git历史恢复。

口琴通过 `node tools/build-fluidr3-harmonica-sf3.mjs [完整FluidR3_GM.sf2或FluidR3Mono_GM.sf3] [输出路径]` 提取：从 Bank 0 / Program 22 复制 Harmonica，保留采样率与循环，以 Vorbis quality 1 编码，独立文件中的 Program 改为 0，适配乐谱现有 MIDI。默认来源是 MuseScore v2.3.2 随附的 FluidR3Mono 2.312（FluidR3 GM 的单声道发行版），以 Git blob 哈希固定并验证输入。完整源库只用于构建，网站仅发布提取后的口琴文件。原作者信息与 MIT 许可证保存在 `vendor/soundfonts/FluidR3Mono-LICENSE.md`，并写入口琴文件的元数据。

口琴文件为 47,932 字节，包含 8 个采样。原始映射只覆盖到 MIDI 96；提取时将最高采样的音区延伸到 MIDI 127，避免高音或移调后无声。常用音区的采样映射不变。

生产资源必须随本站发布，禁止使用第三方 CDN 或远程渲染资源 URL。演奏编译和 MIDI 写入为项目内 TypeScript 实现，不加载 Verovio 或音乐引擎 WASM。简谱继续使用 jpFun，候选自研排版未通过全曲库视觉一致性验收，不进入应用或导出入口；差异审计见 [自研引擎](NATIVE_ENGINES.md)。字体、音源和 AudioWorklet 来自本站构建产物。

`ScoreRenderer` 在编辑或布局参数变化时更新简谱排版。播放实例按需加载并独立销毁。

首页默认直接渲染曲库中的完整《欢乐颂》，使用文档谱例的固定800px版宽、顶部吸附播放条，不显示设置按钮或源码。首页乐谱置于与文档内容相同样式的卡片中，不额外显示“示例”标题，位于三个特性卡片上方；桌面端特性卡片横排、移动端纵排。四个入口依次为浏览乐谱库、打开编辑器、浏览指南、查阅手册，浏览乐谱库为唯一绿色高亮入口；指南和手册通过 `/?doc=guide`、`/?doc=manual` 打开，按需加载 `HomeDocumentation`，直接从内容开始，不显示首页大标题、四个入口或返回首页链接。独立文档简介页和顶部文档入口已删除，旧 `/docs` 链接重定向到首页并保留指南／手册查询及章节定位。指南和手册的所有谱例均使用简谱。加载状态分为渲染库、字体准备与排版。

布局通过视口宽度和主要输入能力判断：`(max-width: 720px), (pointer: coarse) and (hover: none)` 使用移动端规则，覆盖手机及 iPad 等触屏平板的横竖屏；其余使用桌面规则，不读取 User-Agent，也不按横竖屏识别设备。CSS 与 `lib/responsive-layout.ts` 共用这一约定；窗口尺寸或主要输入能力变化时自动重新匹配。

阅读默认采用连续布局与该曲谱集默认版宽，切曲时重置，保留可读字号；桌面阅读页（>720px 且不满足触屏布局条件）分页按顶部栏下方、底部悬浮播放条上方的剩余窗口高度等比缩放整页，多页居中并排，超出一行时自动换行并使用页面纵向滚动，不产生内层滚动条；窗口尺寸或控制面板高度变化时重新适配，仅改变屏幕显示尺寸，不改变排版版宽、分页结果或导出尺寸。移动端（≤720px，或主要输入为粗指针且不支持悬停）分页始终按可用宽度显示并纵向滚动，不按窗口高度缩小整页；移除渲染卡片边框、内边距和分页纸张阴影；阅读页保留屏幕两侧9px留白，谱内保留默认32px页边距；白底分页之间以16px透明间隔露出页面底色，保留分页及宽度设置。阅读宽度通过设置弹层中的滑条调整，打印版宽直接沿用当前阅读宽度，不读取旧的 `m3n:print-width`。共享排版入口将每页内层 SVG 的尺寸明确为外层 viewBox 的坐标尺寸，避免 PDF 转换器把后续页的默认百分比尺寸解释为打印视口而二次缩放。

播放设置不再提供选中小节播放、A–B 循环、声部静音和播放跟随，播放器同步移除循环和声部静音接口。速度以滑条在10–240整数BPM之间逐一调整；一拍与谱面拍速和节拍器一致，按初始拍号分母计拍。例如 6/8、80 qpm 的原速为 160 BPM。播放器按目标 BPM 与 MIDI 初始拍速的比率调整时间轴，保留谱中变速的相对关系，节拍器与预备拍同步。每次打开或切换乐曲采用谱面原速（超出范围时截到边界），手动速度仅保留在当前页面，不读取旧速度缓存。速度还原清除当前覆盖值，不改变其他开关。

首次播放按需加载自研演奏编译和 MIDI 模块，并初始化 AudioWorklet；合成音色仅免去音源采样下载。MIDI 准备和音频播放器模块加载并行执行；同一乐谱的播放器与渲染工具在页面内复用。

导出字体约 16 MB，只在下载时从本站加载。SVG 和 PDF 的文字转为轮廓以保存中文及字形；文字不再可选择或搜索。PNG 使用相同轮廓生成。字体来源、许可证、校验值与重建脚本见 `public/licenses/noto-serif/`。

`tests/e2e/render-resources.spec.ts` 在阻断所有外站 HTTP 请求的条件下验证显示、切换和播放，检查播放不请求 Verovio 或 WASM、谱例节点保留，以及编辑和版宽变化后的缓存失效。端到端测试使用 `.tmp/playwright-dist-<port>` 独立构建，避免常规 `dist` 重建中断测试。`M3N_E2E_PORT` 可覆盖预览端口。测试附件记录本机冷启动与切换耗时，性能数字不作为设备或网络的固定门槛。

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

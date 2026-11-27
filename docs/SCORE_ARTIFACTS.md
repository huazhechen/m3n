# 乐谱生成结果与提交检查

每首 `src/scores/`、`src/works/`、`src/examples/` 下的 `.m3n` 都维护思源黑体子集。浏览器简谱与五线谱阅读器均在1～11档（528～768px，每步24px）共用同一选宽流程，先以24px粗搜，再在最佳粗档位左右各24px范围内以6px细搜（限制在528～768px），逐候选执行完整布局及内部避让，再依次以页数、逐间隔舒适区与字体总代价、版宽择优；SVG独立越界及碰撞验收只在测试模式启用；不将选宽结果写回谱源。字体只使用 Barlow Semi Condensed、Bravura、思源黑体。

五线谱使用原生Bravura字符与数值几何引擎。五线谱和简谱都由浏览器按当前排版实时搜索宽度，不在源文件中保存宽度字段；`npm run prepare:scores` 更新谱源摘要、字体子集及从分发Bravura提取的五线谱字形度量，不执行选宽。

安装依赖时，`npm run prepare` 自动将 Git 的 `core.hooksPath` 设置为 `.githooks`。提交前钩子运行 `node tools/score-artifacts.mjs --staged`：检测谱源或排版依赖变化，重新生成过期结果，并将结果加入本次提交。存在未完整暂存的相关改动时停止提交，避免把工作区中其他改动带进提交。

首次生成只需 Python 的 `fonttools==4.68.0`，不启动浏览器：

```sh
python3 -m venv .tmp/font-subset-env
.tmp/font-subset-env/bin/pip install fonttools==4.68.0 brotli==1.2.1
npm run prepare:scores
```

可通过 `M3N_FONT_PYTHON` 指定 Python，通过 `CHROMIUM_PATH` 指定 Chromium。有系统 Chromium 时优先使用系统版本。宽度测量在浏览器和PDF构建时执行，字体生成不执行选宽。

`config/score-artifacts.json` 记录源文件、排版依赖和所选字体的 SHA-256；宽度和页数不存入生成物。修改谱源只更新对应乐谱；修改影响排版的代码、字体或引擎则更新全部乐谱；五线谱 `src/staff/` 及字形提取脚本也纳入摘要。新增、删除乐谱也会触发生成。CI 执行 `npm run check:score-artifacts`，只校验、不修改文件；绕过本地钩子造成的过期结果会令 CI 失败。

网页乐谱库提供整本简谱谱集导出，使用与页面相同的1～11档（528～768px、24px步长）实时选宽和排版规则及三字体策略；打开弹窗一次完成PDF生成，准备好后点击直接下载。内置曲库使用共享中文总子集；未进入曲库的其他页面按内容选择中文子集，编辑预览中文默认使用系统字体，只加载西文和音乐字体；阅读与导出遇到子集外文字时仍按需使用完整思源黑体。PNG 使用相同字形轮廓，PDF 嵌入实际使用的字体子集。整册合页先以26倍（624px，第5粗档）判断准入，再在528～624px间以24px粗搜及6px细搜选择共同宽度；单曲仍搜索第1～11档。本地 `npm run build:scorebook` 和 `npm run export:score-pdfs` 可生成导出文件，发布脚本按当前内容动态生成 `.tmp/scorebook-font/text.ttf` 总子集，不将总子集放入前端。

`npm run prepare:scores` 同时维护单曲子集、封面目录子集以及归档的三份共享 TTF。线上进入 `/scores` 后并行下载全量谱源包与共享 TTF 包，排版、PNG、PDF 共用字体字节；全部字体安装完成后才开始测量。独立作品及未进入曲库的页面仍可按需使用原有子集。共享字体输入／输出摘要由 CI 和构建校验，修改谱源或装订配置后自动刷新。生成命令及归档规则见 [共享资源](LIBRARY_RESOURCES.md)。

## 验证范围与内存

`npm test` 的常规验证不启动 Chromium。`npm run test:scorebook` 在 Node 中验证粗搜与细搜选宽、合页容量／分组、评分和统计；`npm run test:pdf-font` 使用真实单曲字体子集校验PDF子集字形，避免默认遍历完整中文字体的全部字形。

只有需要真实字体度量、SVG边界和Canvas输出的谱集端到端回归使用 `npm run test:scorebook:browser`。两组浏览器回归串行运行，临时Vite打包在独立子进程完成并退出后才启动浏览器。合成文字使用从原始TrueType轮廓生成的测试专用小子集，字体通过URL读取，不经Base64传输；测试若请求完整中文字体立即失败。测试字体保存在临时目录，不进入前端或曲库生成物。

完整字体全部字形的PDF子集验收按256字形分批执行，逐批释放fontkit字形缓存；单独运行 `npm run test:pdf-font:full`，无需浏览器。完整 `npm run check` 仍包含浏览器回归、完整字体验收和页面端到端检查。首次运行浏览器检查需执行 `npx playwright install chromium` 安装与Playwright匹配的Chromium；可通过 `CHROMIUM_PATH` 指定现有可用版本。上述重检查必须串行执行，并使用单worker、受限Node堆和总进程内存监控，遵守本工作区2GB上限。

CI中的真实字体密度回归保留 `.tmp/notation-density/report.json` 与完整运行日志为 `notation-density-report` 构建附件，即使失败也上传。失败日志末尾同时写入工作流错误注解，墨迹检查会输出曲目、宽度、谱式及具体碰撞／越界，便于从通知追查；生成物摘要校验与密度门禁是不同步骤。

密度回归逐曲启动并关闭浏览器，限制渲染进程数及JS堆；使用独立浏览器进程模型。CI默认使用已安装的Playwright配套浏览器，本地仍可使用系统Chromium，`CHROMIUM_PATH` 可显式覆盖两者。浏览器崩溃与排版断言失败均保留失败状态，不以重试或放宽密度／碰撞阈值掩盖。

# Verovio 精简构建

M3N 的 Verovio 输入只有 MEI，用于五线谱 SVG、MIDI 和播放时间映射。简谱显示继续独立于 Verovio，只有五线谱显示或播放需要时才加载引擎。

## 版本与裁剪范围

- 上游：`rism-digital/verovio`，6.2.0，commit `43f806031bfff2c64003fc8ddd9910820445f6ab`。
- 工具链：Emscripten **4.0.20**；本次使用 CMake **3.31.6**、GNU Make 和 Node.js。
- 产物：`packages/score-renderer/vendor/verovio/verovio-module.mjs`；`build.json` 保存源码与产物 SHA-256、工具链版本和裁剪清单。
- 保留 **Leipzig** 默认音乐字体、**Bravura** 必需的完整符号表与回退字体，以及 `data/text` 中全部 Times 正体、粗体、斜体度量。音乐字体的 CSS、全部字形和文字度量不做字符子集化。
- 排除 **Gootville、Leland、Petaluma** 的全部资源，以及从未启用的 **Liberation.css**。`fontTextLiberation` 默认是 `false`，M3N 不提供开启该选项的入口；Times 及中文浏览器字体回退保持原有行为。
- 通过上游 CMake 选项关闭 DARMS、PAE、ABC、GABC、MXL、Humdrum。DARMS 原本就默认关闭，npm 普通 WASM 版本也已关闭 Humdrum；收益来自其余新增裁剪。
- 保留 MusicXML 和 Verovio 编辑器代码：6.2.0 的对应关闭选项存在不完整的编译保护，分别影响 custom tuning 和 editor shared 类型。精简构建不为此修改上游算法。

SVG、MEI、MIDI、分页和播放时间查询均保留。应用与 renderer 测试直接导入同一份精简模块；`verovio/esm` 包装器仍使用精确固定的 npm `verovio@6.2.0`，以免二进制和包装器版本漂移。完整 npm WASM 仅供验证工具作基准，不进入应用构建。

WASM 继续内嵌在模块中。体积下降来自实际移除嵌入资源和代码，没有把下载量转移到另一个 WASM 文件，也没有引入 CDN 请求。

## 重建

正常 `npm install`、`npm run build` 和 CI 使用已经提交的模块，无需安装 C++ 工具链。只有调整裁剪或升级引擎时需要重建。

1. 安装 CMake、GNU Make、tar、Node.js。
2. 从 `https://github.com/emscripten-core/emsdk` 安装并激活固定版本：

   ```sh
   ./emsdk install 4.0.20
   ./emsdk activate 4.0.20
   source ./emsdk_env.sh
   ```

3. 在 M3N 仓库根目录执行：

   ```sh
   npm run build:verovio
   npm run test:verovio
   npm run check
   ```

`tools/build-verovio.mjs` 校验本地源码压缩包的 SHA-256，并拒绝其他 Emscripten 版本。中间文件放在忽略的 `.tmp/verovio-build/`；默认最多并行 6 个编译任务，可用 `VEROVIO_BUILD_JOBS=2 npm run build:verovio` 调低。重建时不需要下载 Verovio 源码。

源码变化仅包括构建时固定 `git_commit.h` 和替换 CMake 中读取 Git 版本的步骤，防止错误地记录外层 M3N 仓库版本。编译与链接沿用上游 `-O3`、WASM exceptions、128MB 初始内存、64MB 栈及内存增长配置。未修改排版与播放算法。

LGPL 许可证、字体声明、完整原始源码压缩包和对应构建脚本随站点发布在 `/licenses/verovio/`，入口为 `README.txt`。这些文件仅供按需下载，不参与乐谱显示或播放的资源请求。生成脚本会同步该目录下的构建脚本副本。

## 验证与体积

`npm run test:verovio` 将精简引擎与原版 npm WASM 在相同参数、固定 XML ID seed 下对照：82 首内置曲目，加一份包含中英文、粗斜体和 SMuFL 文字符号的 MEI，分别使用 Leipzig 和 Bravura。共 **166 组、196 页**，逐项验证完整 SVG、MIDI、timemap、音符起始时间和时刻对应元素完全一致。脚本同时核验产物 SHA-256，并要求模块 gzip 大小至少下降 15%；报告输出在 `.tmp/verovio-verification.json`。

以下为 2026-10-16 相同应用代码下的生产 `verovio-score-*.js`，使用 Node `zlib` 的 gzip level 9 和 Brotli quality 11 测量；单位为字节：

| 编码 | 原版 | 精简版 | 减少 |
| --- | ---: | ---: | ---: |
| 未压缩 | 7,912,481 | 6,279,364 | 20.6% |
| gzip | 2,340,553 | 1,620,754 | 30.8% |
| Brotli | 1,815,492 | 1,182,740 | 34.9% |

线上实际传输大小仍取决于服务器使用的编码。这里不把压缩算法差异计作裁剪收益；比较的每一行都使用相同编码参数。

`npm run check` 还覆盖 renderer 的真实 WASM 测试、680 组简谱布局检查和浏览器端五线谱显示、播放高亮、分页与导出。资源端到端测试阻断外站请求，并验证切换时引擎仅加载一次、简谱独立显示时不加载 Verovio。

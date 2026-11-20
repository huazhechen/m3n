# 五线谱引擎构建

普通应用构建不需要C++工具链，直接使用 `packages/score-renderer/vendor/verovio/` 中的产物。

需要重建时，安装并激活 Emscripten 4.0.20、CMake 3.31.6、GNU Make、patch、tar和Node.js，执行：

```sh
node tools/build-verovio.mjs
```

源码固定为本地 `public/licenses/verovio/verovio-6.2.0-source.tar.gz`。脚本核验源码摘要，应用 `mei-only.patch` 与 `m3n-layout.patch`，保留Leipzig音乐字形及MEI/SVG能力，输出配套ES模块和WASM，并把精确构建脚本复制到许可证目录。构建中间文件在 `.tmp/verovio-build/`，不使用托管 `dist/`。

`m3n-layout.patch` 提供以下仅用于显示投影的扩展：

- `noJustification` 测量时禁用预测性间距放大，取得可比较的未撑满宽度。
- MEI measure的 `type="m3n-width-N"` 传递引擎内部坐标下的目标小节宽度；修改时间对齐位置，保持字形、文字、五线间距和线宽。
- 歌词syl的 `type="m3n-ink-N"` 传递浏览器实测占宽，在引擎歌词避让中扩展字体回退估计。

这些扩展不写回M3N或领域文档，不参与播放、音高、时值或MIDI编译。没有上述投影标记的调用继续使用上游规则；测量模式的语义修正也适用于普通 `noJustification` 调用。

`build.json` 记录原始源码、两个补丁及最终模块和WASM的SHA256。发布时同步提交产物、补丁、构建脚本和许可证说明。不要只替换WASM或只替换ES模块。

验证使用包内真实引擎测试、`npm run test:staff-layout` 的浏览器几何与像素碰撞审计，以及五线谱交互和导出端到端测试。更改布局后应重新检查建议版宽，旧曲库页数不能作为硬换行、安全避让或作者参数的优先约束。

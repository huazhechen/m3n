# 简谱可见图元对照

音符坐标不能覆盖房子横线、连奏线、文字和其他附件的位置。`tools/compare-numbered-engines.mjs --primitives` 在原有几何与严格像素结果之外，额外记录逐图元诊断。它不修改生产SVG、不调整像素阈值，也不把几何一致改称逐像素一致。

```sh
node --test tools/numbered-primitive-metrics.test.mjs
node tools/compare-numbered-engines.mjs --primitives --pixels --all-widths --render-options=options.json
```

`options.json` 可写为 `{"pageMargin":11}`。不传 `--sources` 时读取当前曲库；完整功能专项须合并 `tools/fixtures/numbered-features.json`、`numbered-houses.json` 和 `numbered-volta-rests.json` 三份输入，合计141份。传入 `--sources` 的文件是名称到M3N源码的JSON对象。输入及三包运行时仍由原工具建立独立快照，不冻结编辑器里的乐谱。

诊断解释当前两版生成的path／line／rect／circle／ellipse／text，将逐层translate累加，扣除各页viewBox原点；将相对／绝对路径规范为相同命令序列，比较实际文字、字体、绘制样式和坐标。它仅支持当前输出使用的平移和M/L/H/V/Q/C/Z路径；不支持的变换、路径命令及外部引用等直接报错，不静默忽略。它不是任意SVG的等价证明器，也不比较浏览器抗锯齿结果。零墨迹文字独立计数，不作为缺少可见图元。

相同样式和路径类型的图元在1px邻域内寻找最近对应物，再逐坐标比较；默认数值容差0.00001px，用于六位小数序列化的诊断。超过该精度的极小真实差异仍照实记录，不为了提高通过率放宽。大于邻域的位移表现为缺失与多余图元，不会被忽略。

JSON与HTML报告增加 `primitiveMatches`、`primitiveAudit`，包括两版数量、配对数量、最大坐标差、缺失／多余／不同数量及少量原始SVG样本。顶层 `primitiveMatching` 汇总该独立结果。原有 `geometryMatches`、`pixelMatches`、`matches` 继续表达原有条件；显式启用图元检查后，任何图元不一致都会使命令退出1。`implementation.json` 同时记录图元工具哈希。

2026-11-17验证：13项浏览器自检通过，覆盖等价平移、相对曲线、分页原点、零墨迹、半径／颜色／图元缺失、房子3px偏移、文字0.1px偏移、继承文字锚点和不支持语法的报错。《第二圆舞曲》参考对参考800px连续的CLI自检，几何／严格像素／图元全部一致，报告 `.tmp/numbered-parity-self-check/2026-11-17T15-50-22.499Z-2399644/`。这只验证工具链，不作为两版全库验收。

当前88首曲库加141份专项已启动默认11px与固定调升半音两轮各1832组检查；结果尚未完成。初段已检出作者文字约0.000061px的真实坐标差，保留为图元不一致，后续按原始图元与截图归因。未据局部自检宣称完整复刻，继续保留jpFun默认显示及自研播放。

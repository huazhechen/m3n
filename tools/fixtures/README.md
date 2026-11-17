# 简谱功能对照谱例

`numbered-features.json` 包含 137 份人工构造的 M3N 谱例，供两套引擎的真实字体对照和自研实绘检查使用。每项以文件名标明所测组合，值为完整谱源。它独立于产品曲库，不固定或替换用户正在编辑的曲目。

谱例覆盖装饰音及叠放、强弱及文字、指法、延长和换气、倚音及升降号、并行／替代声部及歌词、器乐括号、房子线与连奏／发夹／三连音组合、谱中调拍速和导航、歌词实绘、共享谱头空间，以及五种小节等宽场景。它用于补充真实曲库，不能单独证明完整复刻，也不替代显示变换等包级回归。

从仓库根目录执行：

```sh
node tools/compare-numbered-engines.mjs --sources=tools/fixtures/numbered-features.json --all-widths --pixels
node tools/verify-native-ink.mjs --sources=tools/fixtures/numbered-features.json --collisions
```

第一条覆盖 4 种版宽 × 连续／分页，共 1096 组，保留几何和严格像素结果；第二条再覆盖自然／等行高，共 2192 组，检查实际 SVG 的裁切、谱行包络及检查器支持的碰撞。需要复现网页当前页边距时，另通过 `--render-options=<JSON文件>` 传入 `pageMargin` 等选项；以报告实际记录的配置为准。

更新谱例时，应先通过领域诊断，再执行受影响场景的对照；不要通过删除失败场景或放宽工具容差消除差异。

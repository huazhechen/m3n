# 简谱功能对照谱例

`numbered-features.json` 是基础功能谱例集；移除旧替代声部语法后包含 130 份。`numbered-houses.json` 另含 7 份现行房子语法谱例，覆盖共享／单次访问标签、连音歌词、不同遍次歌词、分遍力度、器乐括号及分遍连奏。每项以文件名标明所测组合，值为完整谱源。它们独立于产品曲库，不固定或替换用户正在编辑的曲目。

谱例覆盖装饰音及叠放、强弱及文字、指法、延长和换气、倚音及升降号、并行声部及歌词、器乐括号、房子线与连奏／发夹／三连音组合、谱中调拍速和导航、歌词实绘、共享谱头空间，以及五种小节等宽场景。它用于补充真实曲库，不能单独证明全部能力，也不替代显示变换等包级回归。

下列命令检查自研最终SVG。

从仓库根目录执行：

```sh
node tools/verify-native-ink.mjs --sources=tools/fixtures/numbered-features.json --collisions
node tools/verify-native-ink.mjs --sources=tools/fixtures/numbered-houses.json --collisions
```

每份谱例覆盖4种版宽×连续／分页；实绘检查再覆盖自然／等行高，检查实际 SVG 的裁切、谱行包络及检查器支持的碰撞。两集总计 137 份，对应2192组实绘检查。需要复现网页当前页边距时，另通过 `--render-options=<JSON文件>` 传入 `pageMargin` 等选项；以报告实际记录的配置为准。

更新谱例时，应先通过领域诊断，再执行受影响场景的检查；不要通过删除失败场景或放宽工具容差消除差异。

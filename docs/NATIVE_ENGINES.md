# 自研音乐引擎

音乐输入统一为 `ScoreDocument`。领域解析、简谱布局、演奏编译、MIDI写入及时间映射由项目维护；通用字体解析、XML解析和音频合成继续使用各自的库。

## 数据流

```text
M3N → analyzeM3N → ScoreDocument
                    ├→ NumberedNotationScore → SVG
                    ├→ VexFlow → 自研系统布局 → 五线谱 SVG（可选、按需加载）
                    └→ compileScorePerformance → MIDI → SpessaSynth
```

`analyzeM3N` 一次解析返回语法树、领域文档、诊断及源码映射。整个结果可通过结构化克隆传递，后台Worker与同步分析使用同一入口。

## 渲染

`@m3n/numbered-notation` 的公共 `NumberedNotationScore` 从领域文档完成测量、分行、分页与SVG绘制。字体字号定义比例，真实字形与图元墨迹决定占位和碰撞。渲染参数及布局规则见[简谱渲染](NUMBERED_NOTATION.md)。

## 演奏

`@m3n/notation` 的 `compileScorePerformance` 生成音符、速度图、拍号及事件时间区间；领域演奏顺序处理具名乐段访问、局部反复、房子及导航。`@m3n/score-renderer/playback` 的 `PlaybackScore` 提供MIDI与时间查询，`/player` 负责SpessaSynth和音频时钟。

渲染与播放共用 `scoreEventIds`；连音组子音符保留可定位身份。排版宽度、分页和固定调显示不改变演奏。移调与速度由页面分别同步至谱面与播放器。播放跳转与节拍器排程读取同一MIDI速度图及音频时钟。

## 验证与维护

- `npm run test:packages`：领域、简谱及播放器回归。
- `node tools/test-numbered-snapshot.mjs`：复制当前领域与简谱源码，在同源副本构建和测试；结果记录期间源码变化。
- `node tools/verify-native-ink.mjs --collisions`：浏览器检查最终SVG的裁切、边界和碰撞。
- `node tools/verify-format-rendering.mjs`：检查格式化前后SVG一致。
- `npm run test:e2e`：实际页面编辑、定位、播放、移调和分页。

本站发布字体、音源与AudioWorklet。部分符号轮廓和字体来自第三方，保留所用素材的来源与许可证；许可证不是旧引擎运行依赖。

五线谱独立入口及其与简谱的边界见[五线谱显示](STAFF_NOTATION.md)。

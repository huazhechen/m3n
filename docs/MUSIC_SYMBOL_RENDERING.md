# 简谱音乐符号的绘制与字符替换清单

2026-11-24，核对 `packages/numbered-notation/src/native-*.ts` 的实际绘制入口，以及随项目分发的 Bravura 字体和 `public/licenses/bravura/glyph-sources.tar.gz` 中的码位元数据。以下区分字体字形轮廓与引擎自行组合的几何；并非所有SVG路径都是自行设计的音乐符号。五线谱由VexFlow负责，本次未改变其绘制策略。

## 本轮：升降号直接使用音乐字体字符

音符、和音、倚音、调号和谱头音域中的升号、降号、还原号，统一输出 `font-family="Bravura"` 的SMuFL文字：

| 符号 | 字形 | 码位 |
| --- | --- | --- |
| ♭ | accidentalFlat | U+E260 |
| ♮ | accidentalNatural | U+E261 |
| ♯ | accidentalSharp | U+E262 |

双升／双降保持原来的两个升号／两个降号组合。字号按字体设计墨迹高度换算，位置、间距和避让使用当前任务中的实际文字度量；直接几何与最终SVG共用相同的六位小数位置。无Canvas环境使用随字体核对的设计度量，自定义测量器继续有效。装饰性的音乐字符不进入无障碍读谱文字；音乐语义仍来自谱源。

网页安装原有 `Bravura.woff2`。PNG轮廓化和矢量PDF使用由同一WOFF2无损解包、并将glyf字形边界填充到偶数字节的 `Bravura.ttf`，两者的字形轮廓逐项核对。当前fontkit直接裁剪该WOFF2时会产生空轮廓，且短loca表的子集写入还要求偶数字节边界；因此不能将“源字体包含字符”视为PDF嵌入成功。回归同时检查码位、设计墨迹及裁剪后的真实轮廓。TTF由 `tools/prepare-score-fonts.py` 生成，按项目字体策略共享，不引入新的字体。

## 可以继续改为直接字符的固定字形

下列码位均已在当前分发的Bravura中确认存在。目前仍沿用字体轮廓路径，本轮只清点，没有扩大替换范围。

| 当前用途 | 字形／码位 | 实现入口 | 替换时需要保留 |
| --- | --- | --- | --- |
| 力度 p、pp、ppp、f、ff、fff、mp、mf、sfz | dynamicPiano E520、dynamicPP E52B、dynamicPPP E52A、dynamicForte E522、dynamicFF E52F、dynamicFFF E530、dynamicMP E52C、dynamicMF E52D、dynamicSforzato E539 | `native-dynamics.ts` | 各力度现有墨迹高度、居中及层级避让 |
| 延长记号 | fermataAbove E4C0 | `native-fermata.ts` | 中心位置及与连线的间距 |
| 重音、换气 | articAccentAbove E4A0、breathMarkComma E4CE | `native-articulations.ts` | 实际墨迹与局部奏法堆叠 |
| 颤音、短波音 | ornamentTrill E566、ornamentShortTrill E56C | `native-ornaments.ts` | 两者不同的字号比例 |
| 保持音、简谱跳音／特短断奏 | articTenutoAbove E4A4、articStaccatissimoAboveSmall F47B | `native-symbols.ts` 的 `rawMark` | 跳音／特短断奏仍使用小倒三角；F47B为Bravura专用字形，不能依赖其他音乐字体替代 |
| Segno、Coda圆十字 | segno E047、coda E048 | `native-navigation-glyphs.ts`、`native-symbols.ts` | 音乐轴对齐、Coda文字与导航占位 |

这些替换可共用本轮的字体准备、任务内度量复用及PDF字体策略。每组仍须单独验证墨迹、避让、PNG和PDF，不能只按字符推进宽度替换现有轮廓。

## 可局部使用字体，但需要额外几何处理

| 当前用途 | 可用字形 | 判断 |
| --- | --- | --- |
| 琶音波浪线 | wiggleArpeggiatoUp U+EAA9 | 现在已重复、旋转字体轮廓以覆盖和音高度。可以用旋转字符拼接，但仍需按高度决定数量和拼接间距；内部墨迹测量目前只接受平移，直接替换还需支持旋转后的几何。 |
| 双声部连接括号 | bracketTop U+E003、bracketBottom U+E004、brace U+E000 | 可用固定钩头加伸缩直线组合；整个括号高度由两个声部的实际墨迹决定，不能直接放一个固定字号字符。 |
| 八度点、附点 | augmentationDot U+E1E7 | 技术上可用字形，但当前圆图元十分简单；替换会增加字体度量和定位工作，没有已证实的性能收益。 |
| 小节线、反复线 | 字体提供对应音乐记号 | 当前由少量矩形与圆组成，位置和高度直接匹配简谱音乐轴；暂无理由仅为替换字符而改变笔画和反复点间距。 |

## 保留按实际跨度绘制的图形

- 连音线、延音线：曲率、厚度、收尖、跨行续接及避让均由端点和实际跨度决定，使用 `native-arc.ts` 的曲线。
- 渐强／渐弱线、反复房子、连音组括线：需要随覆盖范围延伸和跨行拆分，保留线段。
- 减时线和连接符杠、延音横线、多小节休止横线：长度、层数或连接范围依赖谱面，保留图元。
- 倚音尾钩：附着于当前倚音块的末端，不是一个可以无差别替换的完整标准音符字形。
- 拍号分隔线、段落框及注释框：属于布局几何。
- 演奏顺序箭头：目前用少量路径确保页面、PNG和PDF一致；历史上存在阅读器替代字体字符映射问题，不因本轮音乐字符优化而更换。

数字音级、歌词、指法、连音组数字、BPM文字、Fine／D.C.／D.S.／To Coda文字和器乐括号已使用文字，无需重复转换。Bravura轮廓数据中保留的 `metNote*` 不代表当前BPM入口正在绘制音符图形；当前入口是文字。

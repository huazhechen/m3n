# 表情／速度文字与练习指导分离

2026-11-26，五线谱将基本功开头的“快速吹吸切换”作为速度说明合并，排到“机能训练”标题上方。根因是所有 `{text=…}` 都可能被当成速度表情文字。

现以 `{expression=…}` 明确标注表情／速度文字；`{text=…}` 保留普通位置指导，不再合并速度。两者使用独立事件字段，可同时存在，不按词义、语言或段标题猜测。简谱同步采用这一区分；`expression` 没有同位置速度变化时单独显示。两种文字均不改变播放速度、音高和时值，数值速度仍由 qpm 或速度渐变指令控制。语法见[手册](MANUAL.md#101-位置文字)。

《查尔达什》的八处速度表情和《You Raise Me Up》的 rit. 已由 text 迁移。基本功及“重复多次，渐弱结束”等普通指导保留 text；导入器已知的 cresc./dim. 文字输出 expression，未知文字仍保留普通提示。

## 联网核对与补回

以下来源于当天实际下载读取的 Mutopia LilyPond 谱源及 IMSLP 乐谱页内的音乐主题谱例。只补文字，不据其他版本更改现有编配的调性、拍号、时值、奏法、反复或播放数值速度。

| 曲目 | 补入内容与位置 | 核对来源 |
| --- | --- | --- |
| 致爱丽丝 | 第一个弱起音 Poco moto | [Mutopia，Breitkopf & Härtel 1888 版](https://www.mutopiaproject.org/ftp/BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.ly)，开头谱音上方标作 Poco moto. |
| 土耳其进行曲 | A 段第一个弱起音 Allegretto | [Mutopia K.331 第三乐章谱源包](https://www.mutopiaproject.org/ftp/MozartWA/KV331/KV331_3_RondoAllaTurca/KV331_3_RondoAllaTurca-lys.zip)，主文件的 piece 字段为 Allegretto |
| C大调奏鸣曲 K.545 第一乐章 | 开头 Allegro；首次副主题 D–B 起点恢复原编配 dolce | [Mutopia 第一乐章](https://www.mutopiaproject.org/ftp/MozartWA/KV545/K545-1/K545-1.ly)的 piece 为 Allegro；[IMSLP 乐谱页](https://imslp.org/wiki/Piano_Sonata_No.16_in_C_major,_K.545_(Mozart,_Wolfgang_Amadeus))也列第一乐章 Allegro。dolce 是恢复提交 `a698c451` 删去的本项目编配文字，**本次下载的 Mutopia 版没有 dolce，不能称为作者原始标记** |
| 惊愕交响曲·小步舞曲 | 开头 Allegro molto | [IMSLP 第94交响曲](https://imslp.org/wiki/Symphony_No.94_in_G_major,_Hob.I:94_(Haydn,_Joseph))第三乐章主题谱例在 G–A 弱起上标 Allegro molto。历史提交 `7580e5b2` 删除的是简写 Allegro；本次按完整标记补入 |
| 爱的礼赞 | 开头 Andante, dolce；紧接起始三音的下一音 legatiss. | [IMSLP Op.12](https://imslp.org/wiki/Salut_d%27amour,_Op.12_(Elgar,_Edward))主题谱例为 Andante，首音 dolce，第二个原谱小节首音 legatiss.。本项目移至 D 调并将两个原谱 2/4 小节合为一个 4/4 小节，对应当前首小节的 3e 与后续 2e，不另改节拍 |
| 梦幻曲 | 首次反复末句首音 ritard.，反复后的主题首音 a tempo；中段返回主题前第三个音 ritard.，主题首音 a tempo；尾部高音句下降到 2e 时 ritardando | [Mutopia Op.15 No.7，Leichte Stucke 1900 版](https://www.mutopiaproject.org/ftp/SchumannR/O15/SchumannOp15No07/SchumannOp15No07.ly)，按 viola 主旋律逐句核对 ritard.、(a tempo)、ritardando；此版有编辑处理，本次没有据其隐藏 MIDI 速度轨改动项目播放 |

《梦幻曲》未添加未经本次谱本支持的开头 Andante／“很慢”等泛化标记；《G弦上的咏叹调》与 BWV 1067 未仅因抒情／快速的听感增补文字。这里不宣称已审校全库的所有力度、速度与表情。

联网下载的谱源、网页和 ZIP 留在 `/tmp/m3n-expression-research/`，不作为应用资源发布。谱源版本不同的标记分别说明，避免把编者提示当成作曲家原文。

## 验证

解析／格式化回归313项、简谱回归1081项、渲染器回归388项及应用528项通过（新增用例修正测试夹具后定向复跑）。类型检查、lint、包边界与生成物校验通过。八份改动谱源逐份验证无错误诊断，并在忽略两类文字指令和空白后与改前完全相同。

实际浏览器以640px分页绘制基本功、六首补写曲、《查尔达什》《You Raise Me Up》及速度文字谱例，共10组，墨迹碰撞／越界均为0；基本功另定向通过“速度—段标题—指导—音乐”的顺序门禁，并目视检查首页截图。截图、SVG及报告保存在 `.tmp/staff-layout-audit/`；这不是全库或全部宽度的验收。重型验证与托管构建串行运行，由聚合RSS看门狗约束在工作区2GB上限以内。

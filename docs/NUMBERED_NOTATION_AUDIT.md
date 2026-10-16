# 简谱逐曲检查记录（2026-10-16）

本轮范围为 `src/scores/` 的全部 82 首内置乐谱。已生成并审视逐曲截图，结合领域事件与原生布局核对；修复后逐曲复查，未发现本轮四类问题残留。曲库测试采用逐文件独立用例，失败时直接报告曲名、事件源码位置和错误类型。

## 已修复的问题

| 问题 | 复现曲目举例 | 原因与修复 |
| --- | --- | --- |
| 拍号等控制记号单独占行，产生空白谱行 | 慢慢喜欢你、明天会更好、秋樱、我和我的祖国、我只在乎你 | 自动换行曾给同一时刻的每个控制记号和音符分别插入换行；改为每轨一次，放在整组控制记号之前，跟随后续音符。调号和速度变化采用相同规则。 |
| 同一边界绘制两次前反复线，换行后记号留在上一行 | ANDY、安妮、卡农、慢慢喜欢你、青鸟 | 前一小节尾部与后一小节开头重复投影；前反复边界只生成一次，并在自动换行和交互分组中归属后一个小节，两个声部共享相同边界。 |
| 长和弦的延音线斜穿和弦 | 欢乐颂 | 起点错误地使用最低音行的最后一根增时线；和弦延音、连奏端点改用完整和弦的原生顶部端口。长和弦发夹仍覆盖增时线，避免被缩成单事件短发夹。 |
| 括号歌词词组的下划线丢失 | 国际歌、同桌的你、ANDY | 领域的 `underlined` 信息未投影；传入 jpFun 的歌词槽选项，由原生排版、绘制和导出处理下划线及占位。 |

运行时继续使用仓库内的 jpFun 和本地字体，保持纯前端；未新增外部资源请求。SVG 适配层只增加交互与语义属性，不补画音乐或移动坐标。

## 验证方法与结果

- 每首曲目在 800px 连续、320px 分页下核对每个事件的数字音高、变音、八度、起始时间和完整时值，并检查调号、拍号、速度及前反复线与后续音符同行。仍检查全部事件 ID、唯一 DOM ID、诊断与总时长。
- Chromium 使用实际字体，对 82 首曲目及 3 个复合回归谱例，运行 320/600/800/1000px × 连续/分页，共 680 次布局；SVG 越界和歌词相交均为 0。
- `npm run test:numbered-audit` 生成 800px 连续与 320px 分页的逐曲截图、索引和逐曲 JSON，位于 `.tmp/numbered-audit/`；无需启动服务器。截图为本地复查产物，不纳入 Git。
- `npm run check`：987 项单元/回归测试（其中 jpFun 652、领域 167、简谱 120、渲染器 27、应用 21）、680 次浏览器几何检查、16 项端到端测试，以及 lint、类型检查和生产构建通过。lint 仍有既有警告，Vite 仍提示 Verovio 块较大。
- 曲库仍保留引擎的 `W_METER_MISMATCH` 参考诊断。引擎按书写小节线检查，而 M3N 允许弱起及互补的乐句片段；未通过删除诊断或改写曲谱来掩盖这些差异。项目领域规则仍是合法性判断依据。

这些结果覆盖当前曲库及列出的语义、布局条件；后续新增曲目会自动进入逐曲测试，不据此承诺任意输入和系统字体组合均达到出版雕版质量。

## 逐曲清单

下表每首均通过事件语义核对与 8 种浏览器布局组合。事件数包括低音、休止和连音组父事件；连音组子音符另逐个核对。

| 曲目 | 文件 | 事件数 | 布局 |
| --- | --- | ---: | --- |
| 爱尔兰画眉 | [ai_er_lan_hua_mei_01.m3n](../src/scores/ai_er_lan_hua_mei_01.m3n) | 75 | 8/8 |
| 暗香 | [an_xiang_01.m3n](../src/scores/an_xiang_01.m3n) | 174 | 8/8 |
| ANDY | [andy_01.m3n](../src/scores/andy_01.m3n) | 170 | 8/8 |
| 安妮 | [annie_01.m3n](../src/scores/annie_01.m3n) | 220 | 8/8 |
| 友谊地久天长 | [auld_lang_syne_01.m3n](../src/scores/auld_lang_syne_01.m3n) | 59 | 8/8 |
| 白桦林 | [bai_hua_lin_01.m3n](../src/scores/bai_hua_lin_01.m3n) | 273 | 8/8 |
| 半音阶口琴基本功 | [ban_yin_jie_kou_qin_ji_ben_gong_01.m3n](../src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n) | 835 | 8/8 |
| 啤酒桶波尔卡 | [beer_barrel_polka_01.m3n](../src/scores/beer_barrel_polka_01.m3n) | 221 | 8/8 |
| 贝加尔湖畔 | [bei_jia_er_hu_pan_01.m3n](../src/scores/bei_jia_er_hu_pan_01.m3n) | 190 | 8/8 |
| 卡农 | [canon_01.m3n](../src/scores/canon_01.m3n) | 467 | 8/8 |
| 天空之城 | [castle_in_the_sky_01.m3n](../src/scores/castle_in_the_sky_01.m3n) | 276 | 8/8 |
| 虫儿飞 | [chong_er_fei_01.m3n](../src/scores/chong_er_fei_01.m3n) | 65 | 8/8 |
| 当年情 | [dang_nian_qing_01.m3n](../src/scores/dang_nian_qing_01.m3n) | 151 | 8/8 |
| 哆啦A梦 | [doraemon_01.m3n](../src/scores/doraemon_01.m3n) | 285 | 8/8 |
| 哆唻咪 | [duo_lai_mi_01.m3n](../src/scores/duo_lai_mi_01.m3n) | 80 | 8/8 |
| 花之舞 | [flower_dance_01.m3n](../src/scores/flower_dance_01.m3n) | 1155 | 8/8 |
| 光阴的故事 | [guang_yin_de_gu_shi_01.m3n](../src/scores/guang_yin_de_gu_shi_01.m3n) | 112 | 8/8 |
| 过火 | [guo_huo_01.m3n](../src/scores/guo_huo_01.m3n) | 224 | 8/8 |
| 红河谷 | [hong_he_gu_01.m3n](../src/scores/hong_he_gu_01.m3n) | 43 | 8/8 |
| 红莓花儿开 | [hong_mei_hua_er_kai_01.m3n](../src/scores/hong_mei_hua_er_kai_01.m3n) | 121 | 8/8 |
| 后来 | [hou_lai_01.m3n](../src/scores/hou_lai_01.m3n) | 352 | 8/8 |
| 欢乐颂 | [huan_le_song_01.m3n](../src/scores/huan_le_song_01.m3n) | 88 | 8/8 |
| 黄昏 | [huang_hun_01.m3n](../src/scores/huang_hun_01.m3n) | 136 | 8/8 |
| 菊次郎的夏天 | [ju_ci_lang_de_xia_tian_01.m3n](../src/scores/ju_ci_lang_de_xia_tian_01.m3n) | 523 | 8/8 |
| 喀秋莎 | [katyusha_01.m3n](../src/scores/katyusha_01.m3n) | 62 | 8/8 |
| 老男孩 | [lao_nan_hai_01.m3n](../src/scores/lao_nan_hai_01.m3n) | 269 | 8/8 |
| 梨花又开放 | [li_hua_you_kai_fang_01.m3n](../src/scores/li_hua_you_kai_fang_01.m3n) | 132 | 8/8 |
| 凉凉 | [liang_liang_01.m3n](../src/scores/liang_liang_01.m3n) | 192 | 8/8 |
| 梁祝 | [liang_zhu_01.m3n](../src/scores/liang_zhu_01.m3n) | 70 | 8/8 |
| 很久以前 | [long_long_ago_01.m3n](../src/scores/long_long_ago_01.m3n) | 81 | 8/8 |
| 漫步人生路 | [man_bu_ren_sheng_lu_01.m3n](../src/scores/man_bu_ren_sheng_lu_01.m3n) | 130 | 8/8 |
| 慢慢喜欢你 | [man_man_xi_huan_ni_01.m3n](../src/scores/man_man_xi_huan_ni_01.m3n) | 202 | 8/8 |
| 美丽的神话 | [mei_li_de_shen_hua_01.m3n](../src/scores/mei_li_de_shen_hua_01.m3n) | 198 | 8/8 |
| 明天会更好 | [ming_tian_hui_geng_hao_01.m3n](../src/scores/ming_tian_hui_geng_hao_01.m3n) | 150 | 8/8 |
| 茉莉花 | [mo_li_hua_01.m3n](../src/scores/mo_li_hua_01.m3n) | 70 | 8/8 |
| 莫斯科郊外的晚上 | [mo_si_ke_jiao_wai_de_wan_shang_01.m3n](../src/scores/mo_si_ke_jiao_wai_de_wan_shang_01.m3n) | 61 | 8/8 |
| 一步之遥 | [por_una_cabeza_01.m3n](../src/scores/por_una_cabeza_01.m3n) | 147 | 8/8 |
| 倩女幽魂 | [qian_nv_you_hun_01.m3n](../src/scores/qian_nv_you_hun_01.m3n) | 70 | 8/8 |
| 牵丝戏 | [qian_si_xi_01.m3n](../src/scores/qian_si_xi_01.m3n) | 218 | 8/8 |
| 青鸟 | [qing_niao_01.m3n](../src/scores/qing_niao_01.m3n) | 314 | 8/8 |
| 秋樱 | [qiu_ying_01.m3n](../src/scores/qiu_ying_01.m3n) | 227 | 8/8 |
| 让我们荡起双桨 | [rang_wo_men_dang_qi_shuang_jiang_01.m3n](../src/scores/rang_wo_men_dang_qi_shuang_jiang_01.m3n) | 70 | 8/8 |
| 人世间 | [ren_shi_jian_01.m3n](../src/scores/ren_shi_jian_01.m3n) | 222 | 8/8 |
| 如愿 | [ru_yuan_01.m3n](../src/scores/ru_yuan_01.m3n) | 304 | 8/8 |
| 散步 | [san_bu_01.m3n](../src/scores/san_bu_01.m3n) | 230 | 8/8 |
| 三套车 | [san_tao_che_01.m3n](../src/scores/san_tao_che_01.m3n) | 86 | 8/8 |
| 斯卡布罗集市 | [scarborough_fair_01.m3n](../src/scores/scarborough_fair_01.m3n) | 44 | 8/8 |
| 第二圆舞曲 | [second_waltz_01.m3n](../src/scores/second_waltz_01.m3n) | 193 | 8/8 |
| 世界赠予我的 | [shi_jie_zeng_yu_wo_de_01.m3n](../src/scores/shi_jie_zeng_yu_wo_de_01.m3n) | 199 | 8/8 |
| 送别 | [song_bie_01.m3n](../src/scores/song_bie_01.m3n) | 58 | 8/8 |
| 寂静之声 | [sound_of_silence_01.m3n](../src/scores/sound_of_silence_01.m3n) | 69 | 8/8 |
| 苏珊娜 | [su_shan_na_01.m3n](../src/scores/su_shan_na_01.m3n) | 59 | 8/8 |
| 超级玛丽 | [super_mario_01.m3n](../src/scores/super_mario_01.m3n) | 247 | 8/8 |
| 太阳照常升起 | [tai_yang_zhao_chang_sheng_qi_01.m3n](../src/scores/tai_yang_zhao_chang_sheng_qi_01.m3n) | 65 | 8/8 |
| 国际歌 | [the_internationale_01.m3n](../src/scores/the_internationale_01.m3n) | 133 | 8/8 |
| 铁血丹心 | [tie_xue_dan_xin_01.m3n](../src/scores/tie_xue_dan_xin_01.m3n) | 89 | 8/8 |
| 听海 | [ting_hai_01.m3n](../src/scores/ting_hai_01.m3n) | 208 | 8/8 |
| 童话镇 | [tong_hua_zhen_01.m3n](../src/scores/tong_hua_zhen_01.m3n) | 282 | 8/8 |
| 同桌的你 | [tong_zhuo_de_ni_01.m3n](../src/scores/tong_zhuo_de_ni_01.m3n) | 159 | 8/8 |
| 土耳其进行曲 | [turkish_march_01.m3n](../src/scores/turkish_march_01.m3n) | 589 | 8/8 |
| Valsentino(快速圆舞曲) | [valsentino_01.m3n](../src/scores/valsentino_01.m3n) | 456 | 8/8 |
| 温柔的倾诉 | [wen_rou_de_qing_su_01.m3n](../src/scores/wen_rou_de_qing_su_01.m3n) | 127 | 8/8 |
| 我的祖国 | [wo_de_zu_guo_01.m3n](../src/scores/wo_de_zu_guo_01.m3n) | 108 | 8/8 |
| 我和你 | [wo_he_ni_01.m3n](../src/scores/wo_he_ni_01.m3n) | 42 | 8/8 |
| 我和我的祖国 | [wo_he_wo_de_zu_guo_01.m3n](../src/scores/wo_he_wo_de_zu_guo_01.m3n) | 135 | 8/8 |
| 蜗牛与黄鹂鸟 | [wo_niu_yu_huang_li_niao_01.m3n](../src/scores/wo_niu_yu_huang_li_niao_01.m3n) | 90 | 8/8 |
| 我要你 | [wo_yao_ni_01.m3n](../src/scores/wo_yao_ni_01.m3n) | 97 | 8/8 |
| 我只在乎你 | [wo_zhi_zai_hu_ni_01.m3n](../src/scores/wo_zhi_zai_hu_ni_01.m3n) | 144 | 8/8 |
| 喜洋洋 | [xi_yang_yang_01.m3n](../src/scores/xi_yang_yang_01.m3n) | 241 | 8/8 |
| 下雨的时候 | [xia_yu_de_shi_hou_01.m3n](../src/scores/xia_yu_de_shi_hou_01.m3n) | 219 | 8/8 |
| 相思 | [xiang_si_01.m3n](../src/scores/xiang_si_01.m3n) | 121 | 8/8 |
| 小红帽 | [xiao_hong_mao_01.m3n](../src/scores/xiao_hong_mao_01.m3n) | 72 | 8/8 |
| 小星星 | [xiao_xing_xing_01.m3n](../src/scores/xiao_xing_xing_01.m3n) | 42 | 8/8 |
| 新不了情 | [xin_bu_liao_qing_01.m3n](../src/scores/xin_bu_liao_qing_01.m3n) | 89 | 8/8 |
| 一千个伤心的理由 | [yi_qian_ge_shang_xin_de_li_you_01.m3n](../src/scores/yi_qian_ge_shang_xin_de_li_you_01.m3n) | 198 | 8/8 |
| 遇见 | [yu_jian_01.m3n](../src/scores/yu_jian_01.m3n) | 166 | 8/8 |
| 月半小夜曲 | [yue_ban_xiao_ye_qu_01.m3n](../src/scores/yue_ban_xiao_ye_qu_01.m3n) | 217 | 8/8 |
| 约定 | [yue_ding_01.m3n](../src/scores/yue_ding_01.m3n) | 180 | 8/8 |
| 月亮代表我的心 | [yue_liang_dai_biao_wo_de_xin_01.m3n](../src/scores/yue_liang_dai_biao_wo_de_xin_01.m3n) | 143 | 8/8 |
| 云宫迅音 | [yun_gong_xun_yin_01.m3n](../src/scores/yun_gong_xun_yin_01.m3n) | 196 | 8/8 |
| 直到世界的尽头 | [zhi_dao_shi_jie_de_jin_tou_01.m3n](../src/scores/zhi_dao_shi_jie_de_jin_tou_01.m3n) | 156 | 8/8 |
| 只要平凡 | [zhi_yao_ping_fan_01.m3n](../src/scores/zhi_yao_ping_fan_01.m3n) | 76 | 8/8 |

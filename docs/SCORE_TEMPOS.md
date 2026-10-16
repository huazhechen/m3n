# 曲库速度校准记录

核查日期：2026-10-16。逐首检查了 82 份内置曲谱，修改 51 份，保留 31 份。

数值是当前简谱编配的建议演奏速度。流行歌曲优先参考曲谱署名的演唱者及原声版本；民歌、古典主题选段和练习曲按编配用途判断，不声称存在唯一的“标准原速”。本次只修改开头的 `qpm`，不修改音符时值、反复、歌词或后续拍号。

## 核查方法

- 先按歌名、演唱者检索 [SongBPM](https://songbpm.com/)，排除同名曲、DJ、改速、现场及不同演唱者。表内链接指向实际检索到的曲目；其 BPM 是数据库记录，可能有半拍、倍拍或自动测速误差。
- 将资料速度与本谱的歌词密度、句长、音符时值一起判断。相同声音写成八分音符或十六分音符时，对应的四分音符速度会不同，不能只复制数据库数字。半速换算均在逐曲说明中列出。
- M3N 的 `qpm` 始终是四分音符/分钟。谱面统一以拍号分母对应的音符标速，不加附点，显示数值为 `qpm × 分母 ÷ 4`；6/8、9/8、12/8 均显示八分音符速度 `qpm × 2`。数据库数值究竟对应八分音符、四分音符还是附点四分音符，须单独确认，不对所有复拍子统一乘除。
- 用 [LRCLIB](https://lrclib.net/) 的同步歌词交叉核对部分容易混淆的拍值。歌词时间戳只作长乐句的近似参照，不当作逐音符的精确演奏时间。
- 检索不到相同版本，或自动测速和谱中拍值不能可靠对应时，明确保留现有编配建议，不以无关作品代替证据。

交叉核对例子：

| 曲目 | 时间戳与谱面对应 | 结果 |
| --- | --- | --- |
| 只要平凡 | [张杰、张碧晨](https://lrclib.net/api/get/19123959)：04.76“也许很远或是昨天”到 21.25“放过对错才知答案”，本谱相隔 8 小节、24 个四分音符 | `24×60÷16.49≈87.3 qpm`；采用 87，显示八分音符 = 174 |
| 贝加尔湖畔 | [李健](https://lrclib.net/api/get/29460955)：56.79“那里春风沉醉”到 64.75“月光把爱恋”，本谱相隔 4 小节、16 个四分音符 | `16×60÷7.96≈120.6 qpm`；采用 120，不能误取半速 60 |
| 相思 | [毛阿敏](https://lrclib.net/api/get/32417738)：18.37“红豆生南国”到 32.73“醉卧不夜城”，本谱相隔 8 小节、24 个四分音符 | `24×60÷14.36≈100.3 qpm`；采用 100 |
| 如愿 | [王菲](https://lrclib.net/api/get/34493274)：31.40“你是遥遥的路”到 45.69“你是明月清风”，本谱两个“你”相隔 16 个四分音符 | `16×60÷14.29≈67.2 qpm`；采用 67。该歌词条目的时长字段与实际歌词时间矛盾，因此只使用歌词中的时间戳 |

《超级玛丽》另参考 [Super Mario Wiki 的 Ground Theme 条目](https://www.mariowiki.com/Ground_Theme_(Super_Mario_Bros.))及 [Super Mario Bros. theme](https://en.wikipedia.org/wiki/Super_Mario_Bros._theme)，两者均列出 100 BPM；本谱开头的十六分音符节奏与该拍值对应。

## 已调整

表内“速度”均为源码的四分音符速度 `qpm`，不一定等于页面按拍号分母音符显示的每分钟拍数。

| 曲谱 | 拍号 | 原速度 → 建议速度 | 网络参照 | 判断 |
| --- | --- | --- | --- | --- |
| [爱尔兰画眉](../src/scores/ai_er_lan_hua_mei_01.m3n) | 4/4 | 96 → **80** | [Joanie Madden · Down By the Salley Gardens（77 BPM）](https://songbpm.com/@joanie-madden/down-by-the-salley-gardens-N3yTK_YBDz) | 参照 Joanie Madden 的舒缓版本（检索另有 89），取适合当前单旋律编配的 80。 |
| [ANDY](../src/scores/andy_01.m3n) | 2/4 | 80 → **68** | [A-do · Andy（136 BPM）](https://songbpm.com/@a-do/andy-RLfT6iILTJ) | 阿杜原唱记录 136；当前 2/4 谱的十六分音符歌词按半速 68 对应。 |
| [安妮](../src/scores/annie_01.m3n) | 4/4 | 68 → **73** | [Dave Wong · 安妮（146 BPM）](https://songbpm.com/@dave-wong/an-ni-Q7BX_rPPmK) | 王杰录音 146；当前谱的十六分音符歌词对应 146÷2=73。 |
| [白桦林](../src/scores/bai_hua_lin_01.m3n) | 3/4 | 112 → **120** | [Pu Shu · 白樺林（119 BPM）](https://songbpm.com/@pu-shu/bai-hua-lin-E83f6xMpXO) | 朴树录音约 119，取整为 120，保留三拍子的流动感。 |
| [贝加尔湖畔](../src/scores/bei_jia_er_hu_pan_01.m3n) | 4/4 | 108 → **120** | [Li Jian · 贝加尔湖畔（119 BPM）](https://songbpm.com/@li-jian/bei-jia-er-hu-pan) | 李健原唱约 119；歌词时间戳支持当前谱四分音符约 120，不再误按半速解释。 |
| [卡农](../src/scores/canon_01.m3n) | 4/4 | 102 → **80** | [Brian Crain · Pachelbel's Canon in D - Solo Piano（79 BPM）](https://songbpm.com/@brian-crain/pachelbel-s-canon-in-d---solo-piano) | 钢琴单旋律编配参照 Brian Crain 的 79，取 80；不声称巴洛克作品有唯一原速。 |
| [天空之城](../src/scores/castle_in_the_sky_01.m3n) | 4/4 | 95 → **116** | [Joe Hisaishi · Carrying You - from 'Castle in the Sky'（116 BPM）](https://songbpm.com/@joe-hisaishi/carrying-you---from-castle-in-the-sky-Hvfg6Pf3JS) | 参照久石让 Carrying You 器乐版本 116；不是其他电影的 One Summer's Day。 |
| [虫儿飞](../src/scores/chong_er_fei_01.m3n) | 4/4 | 72 → **100** | [Ekin Cheng · 蟲兒飛（100 BPM）](https://songbpm.com/@ekin-cheng/chong-er-fei-9-q1GbeSPW) | 郑伊健《虫儿飞》版本约 100，当前谱的四分音符直接对应。 |
| [当年情](../src/scores/dang_nian_qing_01.m3n) | 4/4 | 96 → **80** | [Leslie Cheung · 當年情 - 電影 "英雄本色" 主題曲（80 BPM）](https://songbpm.com/@leslie-cheung/dang-nian-qing---dian-ying-ying-xiong-ben-se-zhu-ti-qu) | 选择张国荣电影主题曲版本 80，排除同名翻唱的 140。 |
| [哆唻咪](../src/scores/duo_lai_mi_01.m3n) | 2/4 | 132 → **128** | [Julie Andrews · Do-Re-Mi（128 BPM）](https://songbpm.com/@julie-andrews/do-re-mi-72566edf-7ad7-470d-9ab4-e6fd5cf514e1) | Julie Andrews 版本记录约 128；乐曲段落有变化，以主题段演奏速度为准。 |
| [花之舞](../src/scores/flower_dance_01.m3n) | 4/4 | 128 → **100** | [DJ Okawari · Flower Dance（100 BPM）](https://songbpm.com/@dj-okawari/flower-dance-f0Dr18IHgH) | DJ OKAWARI 原曲多条记录均为 100；当前谱使用十六分音符，不采用倍速 200。 |
| [过火](../src/scores/guo_huo_01.m3n) | 4/4 | 72 → **63** | [Jeff Chang · 過火（126 BPM）](https://songbpm.com/@jeff-chang/guo-huo) | 张信哲录音 126；谱中每小节的密集十六分音符歌词对应半速 63。 |
| [后来](../src/scores/hou_lai_01.m3n) | 4/4 | 70 → **75** | [Rene Liu · 後來（150 BPM）](https://songbpm.com/@rene-liu/hou-lai) | 原唱录音出现 150 与 75 的倍拍关系；当前十六分音符谱用 75，不选择现场的 156。 |
| [黄昏](../src/scores/huang_hun_01.m3n) | 4/4 | 72 → **78** | [Steve Chou · 黃昏（78 BPM）](https://songbpm.com/@steve-chou/huang-hun) | 周传雄录音 78；其他记录 156 属倍拍，当前谱取 78。 |
| [菊次郎的夏天](../src/scores/ju_ci_lang_de_xia_tian_01.m3n) | 4/4 | 112 → **84** | [Joe Hisaishi · Summer（84 BPM）](https://songbpm.com/@joe-hisaishi/summer---from-kikujiro) | 参照久石让《菊次郎的夏天》原声 Summer 的 84，排除《千与千寻》的 One Summer Day。 |
| [喀秋莎](../src/scores/katyusha_01.m3n) | 2/4 | 120 → **124** | [The Red Army Choir · Katyusha（124 BPM）](https://songbpm.com/@the-red-army-choir/katyusha-d6c89d92-659c-46f0-a1fc-6be6087071e6) | 参照红军合唱团 124–125 的进行性版本，取 124。 |
| [凉凉](../src/scores/liang_liang_01.m3n) | 4/4 | 95 → **90** | [Aska Yang · 凉凉 - 電視劇《三生三世十里桃花》片尾曲（90 BPM）](https://songbpm.com/@aska-yang/5yej5yej-qzetc) | 杨宗纬主题曲版本与伴奏均约 90；排除现场倍拍 180。 |
| [很久以前](../src/scores/long_long_ago_01.m3n) | 4/4 | 96 → **90** | [Thomas Haynes Bayly · Long, Long Ago (Arr. for Violin & Piano)（179 BPM）](https://songbpm.com/@thomas-haynes-bayly/long-long-ago-arr-for-violin-piano-ztfpr) | 小提琴主题录音记录 179，按当前谱取半速约 90；不以变奏的密度反推主题速度。 |
| [漫步人生路](../src/scores/man_bu_ren_sheng_lu_01.m3n) | 4/4 | 96 → **90** | [Teresa Teng · 漫步人生路（90 BPM）](https://songbpm.com/@teresa-teng/5ryr5q2l5lq655sf6lev-y3dfj) | 邓丽君原唱多条记录均为 90；排除翻唱的 184。 |
| [慢慢喜欢你](../src/scores/man_man_xi_huan_ni_01.m3n) | 4/4 | 76 → **65** | [Karen Mok · 慢慢喜歡你（130 BPM）](https://songbpm.com/@karen-mok/5owi5owi5zac5q2h5l2g-vth4t) | 莫文蔚原唱记录 130；当前八分音符歌词及句长对应半速 65。 |
| [美丽的神话](../src/scores/mei_li_de_shen_hua_01.m3n) | 4/4 | 72 → **65** | [Sunnan · Beautiful Myth (美麗的神話)（130 BPM）](https://songbpm.com/@sunnan/myth---duet-ver--oNR8lwj4ht) | 孙楠 Beautiful Myth 原唱记录 130，当前谱对应半速 65；排除 DJ 改编。 |
| [明天会更好](../src/scores/ming_tian_hui_geng_hao_01.m3n) | 4/4 | 76 → **73** | [Various Artists · 明天會更好 (國語)（146 BPM）](https://songbpm.com/@various-artists/ming-tian-hui-geng-hao-guo-yu) | 参照群星合唱版本 146，当前谱取半速 73；不混用蔡琴独立录音。 |
| [茉莉花](../src/scores/mo_li_hua_01.m3n) | 2/4 | 96 → **85** | [北京天使合唱團 · 茉莉花（85 BPM）](https://songbpm.com/@bei-jing-tian-shi-he-chang-tuan/mo-li-hua-Pc5fRLo8KY) | 以北京天使合唱团版本 85 作为歌唱性参照，单旋律编配采用相同速度。 |
| [莫斯科郊外的晚上](../src/scores/mo_si_ke_jiao_wai_de_wan_shang_01.m3n) | 2/4 | 72 → **60** | [Vladimir Troshin · Podmoskovni Vechera (Moscow Nights - Midnight in Moscow)（118 BPM）](https://songbpm.com/@vladimir-troshin/moscow-nights-midnight-in-moscow) | Troshin 原唱约 118–121，当前 2/4 八分音符旋律按半速约 60 对应。 |
| [倩女幽魂](../src/scores/qian_nv_you_hun_01.m3n) | 4/4 | 84 → **118** | [Leslie Cheung · 倩女幽魂 - 電影《倩女幽魂》主題曲（118 BPM）](https://songbpm.com/@leslie-cheung/qian-nu-you-hun) | 张国荣电影原唱多条记录为 118；84 对应的是张晋现场，不能套给本谱原唱。 |
| [牵丝戏](../src/scores/qian_si_xi_01.m3n) | 4/4 | 72 → **86** | [銀臨 · 牵丝戏（172 BPM）](https://songbpm.com/@yin-lin/54m15lid5oip-z7m2m) | 银临原版约 172，当前谱歌词按半速 86 对应；排除 DJ 版本。 |
| [让我们荡起双桨](../src/scores/rang_wo_men_dang_qi_shuang_jiang_01.m3n) | 2/4 | 96 → **112** | [中央人民广播电台少年儿童合唱团 · 让我们荡起双桨 (电影《祖国的花朵》插曲)（113 BPM）](https://songbpm.com/@zhong-yang-ren-min-guang-bo-dian-tai-shao-nian-er-tong-he-chang-tuan/6k6p5oir5lus6i2h6lw35ym5qgoicjnllxlvbhjgirnpzblm73nmotoirhmnlxjgivmj5lmm7ip-cs3me) | 以电影插曲童声合唱版本约 113 为参照，取演奏速度 112，不使用较快的其他童声翻唱。 |
| [人世间](../src/scores/ren_shi_jian_01.m3n) | 4/4 | 72 → **66** | [雷佳 · 人世间（电视剧《人世间》主题曲）（132 BPM）](https://songbpm.com/@lei-jia/ren-shi-jian-dian-shi-ju-ren-shi-jian-zhu-ti-qu-YyI9YYrl85) | 雷佳电视剧主题曲及伴奏均约 132，当前谱按半速 66 对应。 |
| [如愿](../src/scores/ru_yuan_01.m3n) | 2/4 | 72 → **67** | [Faye Wong · 如愿（133 BPM）](https://songbpm.com/@faye-wong/ru-yuan-sScPXIuQ3d) | 王菲原唱约 133，当前谱按半速约 66.5，取整数 67；歌词时间戳亦支持约 67。 |
| [三套车](../src/scores/san_tao_che_01.m3n) | 4/4 | 100 → **90** | [Vladislav Piavko · Вот мчится тройка почтовая（91 BPM）](https://songbpm.com/@vladislav-piavko/vot-mchitsya-troika-pochtovaya-vr14p) | 确认俄语歌名为 Вот мчится тройка почтовая，参照 Piavko 的 91 取 90；不混用器乐 Troika 俄罗斯舞曲。 |
| [斯卡布罗集市](../src/scores/scarborough_fair_01.m3n) | 3/4 | 112 → **128** | [Simon & Garfunkel · Scarborough Fair / Canticle（129 BPM）](https://songbpm.com/@simon-garfunkel/scarborough-fair-canticle-5bf5ebdf-45d8-44a4-b220-77a0237f5cb6) | Simon & Garfunkel 录音约 129，当前 3/4 谱取接近的 128；不用中央公园现场的 113。 |
| [世界赠予我的](../src/scores/shi_jie_zeng_yu_wo_de_01.m3n) | 4/4 | 68 → **62** | [Faye Wong · 世界贈予我的（124 BPM）](https://songbpm.com/@faye-wong/5liw55wm6lsi5lqi5oir55qe-tgbwk) | 王菲原唱与伴奏约 124，当前谱按半速 62 对应。 |
| [寂静之声](../src/scores/sound_of_silence_01.m3n) | 4/4 | 90 → **107** | [Simon & Garfunkel · The Sound of Silence（107 BPM）](https://songbpm.com/@simon-garfunkel/the-sound-of-silence-e2ace595-b388-4c5d-9734-d746192bb50c) | Simon & Garfunkel 原版/木吉他版约 107，电声版约 108；不混用 Disturbed 的 86。 |
| [超级玛丽](../src/scores/super_mario_01.m3n) | 4/4 | 200 → **100** | [Super Mario Wiki · Ground Theme (Super Mario Bros.)（100 BPM）](https://www.mariowiki.com/Ground_Theme_(Super_Mario_Bros.)) | Ground Theme 的公开曲目信息为 100；本谱以十六分音符写主题，200 会快一倍。 |
| [铁血丹心](../src/scores/tie_xue_dan_xin_01.m3n) | 4/4 | 108 → **88** | [Roman Tam · 鐵血丹心 (無線電視劇[射鵰英雄傳之鐵血丹心]主題曲)（176 BPM）](https://songbpm.com/@roman-tam/tie-xie-dan-xin-wu-xian-dian-shi-ju-she-diao-ying-xiong-chuan-zhi-tie-xie-dan-xin-zhu-ti-qu---1998-digital-remaster) | 罗文原版记录 176，当前谱长音与八分音符歌词对应半速 88。 |
| [听海](../src/scores/ting_hai_01.m3n) | 4/4 | 68 → **62** | [A-Mei Chang · 聽海（124 BPM）](https://songbpm.com/@a-mei-chang/6ig95rw3-wrljo) | 张惠妹原唱多条记录约 124，当前谱按半速 62 对应。 |
| [童话镇](../src/scores/tong_hua_zhen_01.m3n) | 4/4 | 78 → **70** | [陈一发儿 · 童话镇（140 BPM）](https://songbpm.com/@6zmi5lia5yr5ys/56ul6kd6zwh-nxigk) | 陈一发儿原版记录 140，当前谱取半速 70；不依据 0.8X 改速条目。 |
| [同桌的你](../src/scores/tong_zhuo_de_ni_01.m3n) | 6/8 | 100 → **96** | [Lao Lang · 同桌的你（95年紅星版）（95 BPM）](https://songbpm.com/@lao-lang/95-splw8) | 老狼原版资料约 95–98，当前 6/8 谱采用四分音符 96（谱面显示八分音符 192），与歌词句长相符。 |
| [蜗牛与黄鹂鸟](../src/scores/wo_niu_yu_huang_li_niao_01.m3n) | 2/4 | 108 → **75** | [YinShia · 蝸牛與黃鸝鳥（75 BPM）](https://songbpm.com/@yinshia/gua-niu-yu-huang-li-niao-fxY7-TITOl) | 银霞原唱记录存在 149–150 与 75 的倍拍关系；当前十六分音符谱采用 75。 |
| [我要你](../src/scores/wo_yao_ni_01.m3n) | 4/4 | 72 → **66** | [任素汐 · 我要你（131 BPM）](https://songbpm.com/@ren-su-xi/wo-yao-ni-eBWm51jQwX) | 任素汐原唱约 131，当前谱取半速约 65.5，取整数 66；不使用现场 128。 |
| [我只在乎你](../src/scores/wo_zhi_zai_hu_ni_01.m3n) | 4/4 | 72 → **70** | [Teresa Teng · 我只在乎你（140 BPM）](https://songbpm.com/@teresa-teng/wo-zhi-zai-hu-ni) | 邓丽君原唱约 140；当前密集十六分音符歌词对应半速 70。 |
| [相思](../src/scores/xiang_si_01.m3n) | 3/4 | 72 → **100** | [毛阿敏 · 相思（100 BPM）](https://songbpm.com/@mao-a-min/55u45ocd-zcf2a) | 毛阿敏原版多条记录为 100，歌词时间戳与本谱三拍子也吻合。 |
| [新不了情](../src/scores/xin_bu_liao_qing_01.m3n) | 4/4 | 66 → **68** | [Wanfang · 新不了情（68 BPM）](https://songbpm.com/@wanfang/xin-bu-liao-qing-cIxI7xlTtf) | 采用万芳原唱记录 68；不混用贵族音乐的 66 翻奏或自动测速为 102 的条目。 |
| [一千个伤心的理由](../src/scores/yi_qian_ge_shang_xin_de_li_you_01.m3n) | 4/4 | 72 → **67** | [Jacky Cheung · 一千個傷心的理由（134 BPM）](https://songbpm.com/@jacky-cheung/yi-qian-ge-shang-xin-de-li-you) | 张学友原唱多条记录约 134，当前谱按半速 67 对应。 |
| [遇见](../src/scores/yu_jian_01.m3n) | 4/4 | 76 → **92** | [Stefanie Sun · 遇見（92 BPM）](https://songbpm.com/@stefanie-sun/yu-jian-2c07d544-1254-4187-b3d1-1a9511d62bc2) | 孙燕姿原唱多条记录均为 92，当前谱四分音符直接对应。 |
| [月半小夜曲](../src/scores/yue_ban_xiao_ye_qu_01.m3n) | 4/4 | 72 → **80** | [Hacken Lee · 月半小夜曲（80 BPM）](https://songbpm.com/@hacken-lee/yue-ban-xiao-ye-qu) | 李克勤原唱多条记录为 80；排除陈乐基等不同编曲。 |
| [约定](../src/scores/yue_ding_01.m3n) | 4/4 | 72 → **80** | [Where Chou · 約定（80 BPM）](https://songbpm.com/@where-chou/yue-ding) | 歌词“远处的钟声”确认是周蕙版本（陈小霞作曲），原唱约 80；不混用王菲同名曲。 |
| [月亮代表我的心](../src/scores/yue_liang_dai_biao_wo_de_xin_01.m3n) | 4/4 | 70 → **78** | [Teresa Teng · 月亮代表我的心（78 BPM）](https://songbpm.com/@teresa-teng/yue-liang-dai-biao-wo-de-xin-e33cc139-7bc9-4b87-8359-311a39cf7131) | 邓丽君原唱多条记录为 78；排除陈佳等翻唱速度。 |
| [云宫迅音](../src/scores/yun_gong_xun_yin_01.m3n) | 4/4 | 140 → **124** | [許鏡清 · 雲宮迅音 (電視劇《西遊記》片頭曲)（124 BPM）](https://songbpm.com/@xu-jing-qing/yun-gong-xun-yin-dian-shi-ju-xi-you-ji-pian-tou-qu-cgrUuZ2W17) | 选择许镜清《西游记》原声条目的 124，排除 DJ 燃版 128 等改编。 |
| [直到世界的尽头](../src/scores/zhi_dao_shi_jie_de_jin_tou_01.m3n) | 4/4 | 140 → **104** | [歌っちゃ王 · 世界が終るまでは・・・(オリジナルアーティスト:WANDS)[ガイドメロディ無しカラオケ]（104 BPM）](https://songbpm.com/@getutiya-wang/shi-jiega-zhongrumadeha-orizinaruateisuto-wands-gaidomerodei-wusikaraoke) | WANDS 原曲卡拉 OK 与乐队重录版本均约 104，当前 4/4 谱采用 104。 |
| [只要平凡](../src/scores/zhi_yao_ping_fan_01.m3n) | 6/8 | 76 → **87** | [张碧晨 · 只要平凡 - 电影《我不是药神》主题曲（174 BPM）](https://songbpm.com/@5byg56kn5pmo/5yq6kab5bmz5yehic0g55s15b2x44ck5oir5lin5piv6i2v56we44cl5li76aky5puy-x4hir) | 原唱记录 174 对应八分音符脉冲，当前 6/8 谱取四分音符 87，谱面显示八分音符 174；以歌词时间戳交叉核对。 |

## 已核查并保留

保留不等于已确认唯一原速；下面区分了有录音支持、编配建议及暂缺可靠版本三种情况。

| 曲谱 | 拍号 | 建议速度 | 网络参照 | 判断 |
| --- | --- | --- | --- | --- |
| [暗香](../src/scores/an_xiang_01.m3n) | 4/4 | 70 | [沙宝亮 · 暗香 (电视剧《金粉世家》主题曲)（140 BPM）](https://songbpm.com/@sha-bao-liang/5pqx6aazicjnllxop4bliafjgirph5hnsonkujblrrbjgivkulvpopjmm7ip-tgg9r) | 录音资料 140，当前谱用十六分音符写密集歌词，按半速 70 对应；保留。 |
| [友谊地久天长](../src/scores/auld_lang_syne_01.m3n) | 2/4 | 92 | [Traditional · Auld Lang Syne（92 BPM）](https://songbpm.com/@traditional/auld-lang-syne-rU_NLDBXL_) | 传统歌曲有不同演奏速度；已有 92 与检索到的同名传统版本一致。 |
| [半音阶口琴基本功](../src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n) | 4/4 | 60 | 未确认同版本，或按练习用途判断 | 基本功练习起步速度，按训练用途保留，不以商业录音替换。 |
| [啤酒桶波尔卡](../src/scores/beer_barrel_polka_01.m3n) | 2/4 | 132 | [Yvette Horner · Beer Barrel Polka（132 BPM）](https://songbpm.com/@yvette-horner/beer-barrel-polka--HUjkRgmi4) | Yvette Horner 版本 132，现有波尔卡速度合适。 |
| [哆啦A梦](../src/scores/doraemon_01.m3n) | 4/4 | 120 | [カラオケまねきねこ · Doraemon no Uta - Karaoke Ōsugi Kumiko（123 BPM）](https://songbpm.com/@44kr44op44kq44kx44g44gt44gn44gt44gt/doraemon-no-uta-karaoke-osugi-kumiko-wap33) | 大杉久美子版卡拉 OK 约 123；保留接近原曲、便于演奏的 120。 |
| [光阴的故事](../src/scores/guang_yin_de_gu_shi_01.m3n) | 6/8 | 100 | [羅大佑 · 光陰的故事（210 BPM）](https://songbpm.com/@luo-da-you/guang-yin-de-gu-shi-3Oozx4kX6E) | 罗大佑不同版本及自动测速（210、69）存在拍值和编曲差异；现按 6/8 记谱，保留四分音符 100 qpm，显示八分音符 200，不机械照抄数据库数值。 |
| [红河谷](../src/scores/hong_he_gu_01.m3n) | 4/4 | 92 | [Liu Fang · The Romance Of The Red River Valley（86 BPM）](https://songbpm.com/@liu-fang/the-romance-of-the-red-river-valley) | 传统民歌录音版本不同（本次检索 86、99 等）；保留适合当前编配的中慢速 92。 |
| [红莓花儿开](../src/scores/hong_mei_hua_er_kai_01.m3n) | 2/4 | 96 | [Ирина Шведова · Ой цветёт калина（141 BPM）](https://songbpm.com/@irina-shvedova/oy-cvetyot-kalina-go7yAOQX_g) | 俄语版本测速 77–141，未确定与本谱相同的编配；保留已有歌唱性中速。 |
| [欢乐颂](../src/scores/huan_le_song_01.m3n) | 4/4 | 120 | [Ludwig van Beethoven · Ode to Joy（109 BPM）](https://songbpm.com/@ludwig-van-beethoven/ode-to-joy-bXbrk8pUXH) | 本谱为《第九交响曲》合唱主题的教学选段，保留明朗的 120，不套用完整第四乐章的平均测速。 |
| [老男孩](../src/scores/lao_nan_hai_01.m3n) | 2/4 | 72 | [筷子兄弟 · 老男孩（144 BPM）](https://songbpm.com/@kuai-zi-xiong-di/lao-nan-hai-vK2JCI10kJ) | 筷子兄弟录音 144；当前 2/4 谱按半速 72 对应，保留。 |
| [梨花又开放](../src/scores/li_hua_you_kai_fang_01.m3n) | 4/4 | 72 | 未确认同版本，或按练习用途判断 | 未找到可确认的周峰原唱速度；韩红现场、陈佳等翻唱不作为原唱证据，暂保留。 |
| [梁祝](../src/scores/liang_zhu_01.m3n) | 4/4 | 72 | [华夏民族乐团 · 梁祝 - 古筝独奏（85 BPM）](https://songbpm.com/@hua-xia-min-zu-le-tuan/liang-zhu---gu-zheng-du-zou-ge4mwde5Cd) | 小提琴协奏曲有多个速度段，本谱抽取抒情主题；保留歌唱性的 72，不套用古筝改编的平均速度。 |
| [一步之遥](../src/scores/por_una_cabeza_01.m3n) | 4/4 | 120 | [Carlos Gardel · Scent of a Woman: Tango (Por Una Cabeza)（118 BPM）](https://songbpm.com/@carlos-gardel/scent-of-a-woman-tango-por-una-cabeza) | 器乐探戈主题参照 Scent of a Woman 条目的 118，保留接近的 120；不混用 Gardel 慢唱版本的 55–64。 |
| [青鸟](../src/scores/qing_niao_01.m3n) | 4/4 | 152 | [Ikimonogakari · ブルーバード（152 BPM）](https://songbpm.com/@ikimonogakari/blue-bird-cce7a2b3-1e63-4775-89bf-a41401ead3a4) | 生物股长《ブルーバード》原版 152，已有标注正确。 |
| [秋樱](../src/scores/qiu_ying_01.m3n) | 4/4 | 76 | [歌っちゃ王 · 秋桜(原曲歌手: 山口百恵)（152 BPM）](https://songbpm.com/@ge-tutiyawang/qiu-ying-yuan-qu-ge-shou-shan-kou-bai-hui-gHID4-Csiu) | 山口百惠原曲的卡拉 OK 记录 152，另有 76；当前谱采用半速 76，保留。 |
| [散步](../src/scores/san_bu_01.m3n) | 4/4 | 92 | 未确认同版本，或按练习用途判断 | 缺少作者及演奏者，不能确认检索到的同名作品；保留现有编配速度。 |
| [第二圆舞曲](../src/scores/second_waltz_01.m3n) | 3/4 | 180 | [Dmitri Shostakovich · Shostakovich: Jazz Suite No. 2: VI. Waltz II（180 BPM）](https://songbpm.com/@dmitri-shostakovich/shostakovich-jazz-suite-no-2-vi-waltz-ii-uxc5i) | 《Jazz Suite No. 2: VI. Waltz II》录音记录 180，现有三拍子速度保留。 |
| [送别](../src/scores/song_bie_01.m3n) | 4/4 | 72 | [Chyi Yu · 送別（128 BPM）](https://songbpm.com/@chyi-yu/song-bie-Pp28UliuUR) | 传统歌曲的齐豫、童声合唱等版本节拍不同；保留本谱舒缓的 72 作为编配建议。 |
| [苏珊娜](../src/scores/su_shan_na_01.m3n) | 2/4 | 112 | [2nd South Carolina String Band · Oh! Susanna（114 BPM）](https://songbpm.com/@2nd-south-carolina-string-band/oh-susanna) | 传统版本约 114–124；保留接近、易于演奏的 112。 |
| [太阳照常升起](../src/scores/tai_yang_zhao_chang_sheng_qi_01.m3n) | 4/4 | 100 | 未确认同版本，或按练习用途判断 | 未检索到可确认的久石让对应原声版本；排除痛仰同名曲，保留现有速度。 |
| [国际歌](../src/scores/the_internationale_01.m3n) | 4/4 | 104 | [Unspecified · The Internationale（104 BPM）](https://songbpm.com/@unspecified/the-internationale-0Vbeoep6-M) | 检索到同名演奏版本为 104，保留庄严的进行速度；不混用不同合唱编曲。 |
| [土耳其进行曲](../src/scores/turkish_march_01.m3n) | 2/4 | 132 | [Wolfgang Amadeus Mozart · Piano Sonata No. 11 in A Major, K. 331: III. Rondo alla Turca. Allegretto（131 BPM）](https://songbpm.com/@wolfgang-amadeus-mozart/piano-sonata-no11-in-a-k331---alla-turca-3-alla-turca-allegretto-ce35b3e8-27a2-4c23-a498-7ef83eed8cb2) | K.331 第三乐章 Allegretto 录音约 131，现有 132 合适；不用其他同名改编。 |
| [Valsentino(快速圆舞曲)](../src/scores/valsentino_01.m3n) | 3/4 | 176 | [Tommy Reilly · Valsentino（111 BPM）](https://songbpm.com/@tommy-reilly/valsentino-wn99r) | Tommy Reilly 录音测速 106–111 与三拍子谱的拍值有歧义；保留快速圆舞曲编配的 176，不将自动测速直接当四分音符速度。 |
| [温柔的倾诉](../src/scores/wen_rou_de_qing_su_01.m3n) | 4/4 | 68 | [Nino Rota · Love Theme From "The Godfather"（69 BPM）](https://songbpm.com/@nino-rota/love-theme-from-the-godfather) | Nino Rota 主题录音约 69，保留接近的 68，避免混用快版或全组曲平均速度。 |
| [我的祖国](../src/scores/wo_de_zu_guo_01.m3n) | 4/4 | 76 | [郭兰英 · 我的祖国（173 BPM）](https://songbpm.com/@guo-lan-ying/5oir55qe56ww5zu9-oxa98) | 郭兰英同名录音的自动测速分歧较大（93、108、173），原曲也有段落伸缩；保留抒情主题编配的 76。 |
| [我和你](../src/scores/wo_he_ni_01.m3n) | 4/4 | 60 | 未确认同版本，或按练习用途判断 | 仅确认到刘欢现场版本而未确认奥运会原版测速，保留原谱舒缓的 60。 |
| [我和我的祖国](../src/scores/wo_he_wo_de_zu_guo_01.m3n) | 6/8 | 80 | [李谷一 · 我和我的祖国（162 BPM）](https://songbpm.com/@5p2o6lc35lia/5oir5zkm5oir55qe56ww5zu9-qzk2s) | 李谷一版本记录 162 可按八分音符脉冲理解，当前 6/8、9/8 谱四分音符约 81；保留接近的 80，谱面显示八分音符 160，不把 162 直接写成 qpm。 |
| [喜洋洋](../src/scores/xi_yang_yang_01.m3n) | 2/4 | 120 | [刘明源 · 喜洋洋（185 BPM）](https://songbpm.com/@liu-ming-yuan/xi-yang-yang-2frABcPKUX) | 民族器乐录音自动测速约 184–185，但本谱含密集十六分音符且结构不同；保留 120 的演奏建议，未据平均测速强行改成 185。 |
| [下雨的时候](../src/scores/xia_yu_de_shi_hou_01.m3n) | 4/4 | 80 | 未确认同版本，或按练习用途判断 | 原谱未署名，检索到的小提琴及同名流行歌曲无法确认为同一编配；保留 80。 |
| [小红帽](../src/scores/xiao_hong_mao_01.m3n) | 2/4 | 108 | [呂佩玉 · 小红帽 - 童謠：妹妹揹著洋娃娃（109 BPM）](https://songbpm.com/@lu-pei-yu/5bcp57qi5bi9ic0g56ul6kygouwmuewmueapueirla0iwogwogw-joxip) | 童谣版本约 109–120，保留接近、便于演奏的 108。 |
| [小星星](../src/scores/xiao_xing_xing_01.m3n) | 4/4 | 100 | [Raffi · Twinkle, Twinkle, Little Star（98 BPM）](https://songbpm.com/@raffi/twinkle-twinkle-little-star-77f5554f-9033-44a4-b566-21aa82cb9fce) | Raffi 版本约 98；教学型单旋律编配保留接近的 100。 |

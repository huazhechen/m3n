# Verovio 本地参考手册

> 适用版本：`verovio@6.2.0`（本仓库已安装版本）
> 更新日期：2026-08-01
> 用途：供开发 Agent 离线查阅 Verovio 的范围、MEI 正式写法、WASM API 与排版规范。

## 快速定位

| 目标 | 搜索本页 | 首选元素/API |
| --- | --- | --- |
| 最小可渲染乐谱 | `最小 MEI` | `meiHead`, `scoreDef`, `section` |
| 音符、休止、和弦 | `音符与时值` | `note`, `rest`, `chord` |
| 调号、拍号、谱号 | `音高和全局定义` | `keySig`, `meterSig`, `clef` |
| 声部与钢琴大谱表 | `声部、谱表` | `staff`, `layer`, `staffGrp` |
| 符杠、连线、连音 | `横向关系` | `beam`, `tie`, `slur`, `tuplet` |
| 力度、速度、装饰 | `演奏标记` | `dynam`, `tempo`, `artic`, `ornam` |
| 歌词、和弦、反复 | `文字、歌词`、`反复` | `verse`, `harm`, `ending` |
| 换行、分页 | `版面` | `sb`, `pb`, `breaks` |
| SVG、MIDI、播放光标 | `WASM Toolkit` | `renderToSVG`, `renderToMIDI`, `getElementsAtTime` |

## 1. 范围与边界

Verovio 是将乐谱数据雕版为 SVG 的引擎。它不是所见即所得编辑器、音频合成器、完整 MEI schema 校验器，也不是任意格式间的无损转换器。

- **规范性输入**：MEI XML。需要稳定、可编辑、可映射 SVG/MIDI 的数据时，生成 MEI。
- **导入能力**：可处理部分 MusicXML、ABC、PAE；`verovio/wasm-hum` 构建提供 Humdrum 支持。导入保真度随格式和功能而异，原始文件必须另行保存。
- **输出能力**：分页 SVG、MIDI Base64 data URL、time map、反复展开映射、MEI、PAE；Humdrum 转换依赖带 Humdrum 的构建。
- **标准责任**：MEI 的元素、属性与语义由 MEI Guidelines 定义，Verovio 负责读取和排版。本文的 XML 是 MEI 正式写法，不把 Verovio 的容错当作标准合法性。

## 2. 最小 MEI

`meiHead` 是元数据；`music/body/mdiv/score` 是乐谱；`scoreDef` 定义谱表；`section` 放置时间序列。每个 `measure` 内按 `staff`，其内按 `layer` 放事件。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <meiHead>
    <fileDesc>
      <titleStmt><title>Example</title><composer>Composer</composer></titleStmt>
      <pubStmt><p>Unpublished</p></pubStmt>
    </fileDesc>
  </meiHead>
  <music><body><mdiv><score>
    <scoreDef meter.count="4" meter.unit="4">
      <staffGrp>
        <staffDef n="1" lines="5" clef.shape="G" clef.line="2"
                  key.sig="0" key.mode="major"/>
      </staffGrp>
    </scoreDef>
    <section>
      <measure n="1">
        <staff n="1"><layer n="1">
          <note xml:id="n1" pname="c" oct="4" dur="4"/>
          <note xml:id="n2" pname="d" oct="4" dur="4"/>
          <note xml:id="n3" pname="e" oct="4" dur="4"/>
          <note xml:id="n4" pname="f" oct="4" dur="4"/>
        </layer></staff>
      </measure>
    </section>
  </score></mdiv></body></music>
</mei>
```

### 结构规则

1. 根元素使用 MEI 命名空间，`meiversion` 与生成器目标版本一致。
2. `staffDef@n`、每小节 `staff@n`、其下 `layer@n` 必须对应。不可直接把音符放在 `measure` 或 `staff` 下。
3. layer 是一个节奏时间序列；同时起止的多音高用 `chord`，独立节奏用另一个 `layer`。
4. 任何被控制事件、播放或 UI 引用的对象必须有稳定、唯一 `xml:id`。引用写为 `#id`。
5. 每声部的小节时值须与拍号相符。不得依赖排版器修复少拍或多拍。
6. XML 文字须转义：`&` 为 `&amp;`，`<` 为 `&lt;`。生成器应使用 DOM/XML builder，而非未转义字符串拼接。

## 3. 音乐元素的正式写法

### 3.1 音符与时值

音符使用 `pname`（`a` 至 `g`）与 `oct`（科学音高八度）；`dur` 是时值分母，`dots` 是附点数。

| 元素 | MEI 写法 | 规则 |
| --- | --- | --- |
| 全、二、四、八分音符 | `<note pname="c" oct="4" dur="1"/>`；改为 `2`、`4`、`8` | `dur` 是分母；常用还有 `16`、`32`、`64`。 |
| 附点 | `<note ... dur="4" dots="1"/>` | 双附点：`dots="2"`。 |
| 休止 | `<rest dur="4"/>` | 无 `pname` / `oct`。 |
| 占位空白 | `<space dur="4"/>` | 占时间但通常不打印休止符。 |
| 多小节休止 | `<mRest/>` | 写在小节的 layer 内。 |
| 和弦 | `<chord dur="4"><note .../><note .../></chord>` | 时值属于 `chord`，子音符不写 `dur`。 |
| 无定高音符 | `<note loc="6" dur="4"/>` | 以谱表位置 `loc` 表示。 |

```xml
<layer n="1">
  <note xml:id="a" pname="c" oct="4" dur="4" dots="1"/>
  <rest dur="8"/>
  <chord xml:id="c-major" dur="8">
    <note pname="c" oct="4"/><note pname="e" oct="4"/><note pname="g" oct="4"/>
  </chord>
</layer>
```

### 3.2 音高和全局定义

| 意图 | 正式写法 | 要点 |
| --- | --- | --- |
| C 升 | `<note pname="c" oct="4" accid="s" dur="4"/>` | 常用 `accid`：`s` 升、`f` 降、`n` 还原、`ss` 重升、`ff` 重降。 |
| 独立临时记号 | `<note ...><accid accid="s"/></note>` | 子元素写法利于区分显示记号和演奏音高。 |
| D 大调 | `<keySig sig="2s" mode="major"/>` | 初始值也可写为 `staffDef key.sig="2s" key.mode="major"`。 |
| F 小调 | `<keySig sig="4f" mode="minor"/>` | `sig` 是数量和方向。 |
| 高音/低音谱号 | `<clef shape="G" line="2"/>` / `<clef shape="F" line="4"/>` | 初始值可写 `clef.shape`、`clef.line`。 |
| 4/4、6/8 | `<meterSig count="4" unit="4"/>` / `<meterSig count="6" unit="8"/>` | 初始值可写 `scoreDef meter.count`、`meter.unit`。 |

全局初始定义写在 `scoreDef/staffDef` 属性；中途变化以 `keySig`、`meterSig`、`clef` 事件置于变化发生处。不能只改后续音符而省略可见的调号、拍号或谱号。

```xml
<measure n="9"><staff n="1"><layer n="1">
  <keySig sig="3s" mode="major"/>
  <meterSig count="3" unit="4"/>
  <clef shape="F" line="4"/>
  <note pname="a" oct="3" dur="4"/>
</layer></staff></measure>
```

### 3.3 声部、谱表和分组

```xml
<scoreDef meter.count="4" meter.unit="4">
  <staffGrp symbol="brace" bar.thru="true">
    <staffDef n="1" label="Piano RH" clef.shape="G" clef.line="2"/>
    <staffDef n="2" label="Piano LH" clef.shape="F" clef.line="4"/>
  </staffGrp>
</scoreDef>
<measure n="1">
  <staff n="1">
    <layer n="1"><note pname="c" oct="5" dur="2"/></layer>
    <layer n="2"><rest dur="2"/><note pname="g" oct="4" dur="2"/></layer>
  </staff>
  <staff n="2"><layer n="1"><chord dur="1"><note pname="c" oct="3"/><note pname="g" oct="3"/></chord></layer></staff>
</measure>
```

- `staff` 是物理谱表；`layer` 是独立节奏声部。`n` 是标识而非自动排序命令。
- 钢琴大括号用 `staffGrp symbol="brace"`；括号可用 `bracket`；贯穿小节线用 `bar.thru="true"`。
- 同一时刻的垂直音高必须用 `chord`；写进不同 layer 就是独立声部，会改变符干、避让和 MIDI。

### 3.4 横向关系：符杠、连音、连线、延音

| 元素 | 正式写法 | 用途 |
| --- | --- | --- |
| 符杠 | `<beam><note .../><note .../></beam>` | `beam` 包含连续事件。 |
| 三连音 | `<tuplet num="3" numbase="2">...</tuplet>` | 3 个写作单位占 2 个同类单位。 |
| 连线 | `<slur startid="#n1" endid="#n4"/>` | 乐句/不同音高；可加 `curvedir="above"`。 |
| 延音线 | `<tie startid="#n1" endid="#n2"/>` | 两端必须同音高；不要用 `slur` 代替。 |
| 震音 | `<bTrem unitdur="16">...</bTrem>` | 双音或成组震音用 tremolo 元素。 |

```xml
<layer n="1">
  <beam>
    <note xml:id="n1" pname="c" oct="4" dur="8"/><note xml:id="n2" pname="d" oct="4" dur="8"/>
    <note xml:id="n3" pname="e" oct="4" dur="8"/><note xml:id="n4" pname="f" oct="4" dur="8"/>
  </beam>
  <tuplet num="3" numbase="2">
    <note pname="g" oct="4" dur="8"/><note pname="a" oct="4" dur="8"/><note pname="b" oct="4" dur="8"/>
  </tuplet>
  <note xml:id="t1" pname="c" oct="5" dur="4"/><note xml:id="t2" pname="c" oct="5" dur="4"/>
</layer>
<slur startid="#n1" endid="#n4" curvedir="above"/>
<tie startid="#t1" endid="#t2"/>
```

控制元素可放在共同祖先（通常 `measure` 或 `section`）下；每个 `startid`/`endid` 都必须引用存在的 `xml:id`。

### 3.5 演奏标记、装饰和速度

| 意图 | 正式写法 | 说明 |
| --- | --- | --- |
| 断奏、重音、保持 | `<artic artic="stacc" startid="#n1"/>` | 常见替代：`acc`、`ten`；位置可用 `place="above"`。 |
| 延长记号 | `<fermata startid="#n1" place="above"/>` | 引用 note/rest/chord。 |
| 颤音 | `<ornam startid="#n1" form="trill"/>` | 装饰记号与实际演奏音高是不同信息。 |
| 倚音/装饰音 | `<note ... grace="unacc"/>` | 无斜线常用 `grace="acc"`。 |
| 力度 | `<dynam startid="#n1">mf</dynam>` | 文本是力度记号。 |
| 渐强/弱 | `<hairpin form="cres" startid="#n1" endid="#n4"/>` | 渐弱：`form="dim"`。 |
| 速度 | `<tempo startid="#n1" mm="120" mm.unit="4">Allegro</tempo>` | `mm` 和 `mm.unit` 使播放速度明确。 |

原则：时值和音高写在 `note` / `chord` / `rest`；附着或跨事件记号优先写成引用 `startid`/`endid` 的控制元素。这比把视觉文本塞入音符属性更利于重排、SVG ID 映射和编辑。

### 3.6 文字、歌词、和弦和排练号

```xml
<measure n="1">
  <staff n="1"><layer n="1">
    <note xml:id="lyr1" pname="c" oct="4" dur="4"/><note xml:id="lyr2" pname="d" oct="4" dur="4"/>
    <note xml:id="lyr3" pname="e" oct="4" dur="2"/>
  </layer></staff>
  <verse n="1">
    <syl startid="#lyr1" wordpos="i">Hal</syl>
    <syl startid="#lyr2" con="d" wordpos="t">le</syl>
    <syl startid="#lyr3" wordpos="s">lujah</syl>
  </verse>
  <harm startid="#lyr1">C</harm><dir startid="#lyr1" place="above">dolce</dir><reh startid="#lyr1">A</reh>
</measure>
```

- `verse@n` 区分歌词段；`syl` 的 `startid` 对应音符。`wordpos`：`s` 单音节、`i` 首、`m` 中、`t` 末；`con="d"` 是连字符。
- 中文歌词通常一字/词一个 `syl`，不添加英文分音节的 `wordpos` 或 `con`。
- `harm` 是和弦符号，`dir` 是自由文字，`reh` 是排练号。需随时间轴定位时都应写 `startid`；标题等元数据写入 `meiHead`。

### 3.7 小节线、反复和结尾

| 意图 | 写法 | 规则 |
| --- | --- | --- |
| 普通小节线 | 连续 `<measure>` | 通常不需要手写。 |
| 重复起始/结束 | `<measure left="rptstart">` / `<measure right="rptend">` | 标记对应小节边界。 |
| 起止重复 | `left="rptstart" right="rptend"` | 同一小节可同时具有两边界。 |
| 一、二房子 | `<ending n="1">...</ending>` | `ending` 包住所属小节。 |
| 乐段 | `<section>` | 可含小节、`ending`、`sb`、`pb`。 |

```xml
<section>
  <measure n="1" left="rptstart">...</measure>
  <ending n="1"><measure n="2" right="rptend">...</measure></ending>
  <ending n="2"><measure n="3" right="end">...</measure></ending>
</section>
```

显示的重复符号和播放展开不是一回事。结构写入 MEI；播放时使用 `renderToExpansionMap()` 或播放器逻辑。不要先复制小节来伪造反复。

### 3.8 版面

```xml
<section>
  <measure n="1">...</measure><sb/>
  <measure n="2">...</measure><pb/>
  <measure n="3">...</measure>
</section>
```

- `sb` 是系统换行，`pb` 是分页。仅在尊重原始版面或用户明确插入时编码。
- 使用 `setOptions({ breaks: 'encoded' })` 才采用 `sb`/`pb`；`breaks: 'auto'` 让 Verovio 自动换行。
- MEI 保存语义，Verovio 计算几何。不要持久化 SVG 坐标、CSS 或临时布局作为音乐语义。

## 4. WASM Toolkit（6.2.0）

### 推荐生命周期

```ts
import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'

const module = await createVerovioModule()
const toolkit = new VerovioToolkit(module)
try {
  toolkit.setOptions({
    breaks: 'auto', pageWidth: 2100, pageHeight: 2970, scale: 40,
    svgViewBox: true, header: 'none', footer: 'none',
  })
  if (!toolkit.loadData(meiXml)) throw new Error(toolkit.getLog())
  const pages = Array.from({ length: toolkit.getPageCount() }, (_, index) => toolkit.renderToSVG(index + 1))
  const midiDataUrl = toolkit.renderToMIDI()
} finally {
  toolkit.destroy()
}
```

顺序必须是：创建模块 -> 创建 toolkit -> `setOptions` -> `loadData` -> 查询/渲染 -> `destroy`。组件卸载、乐谱替换或请求取消时必须释放 toolkit，避免 WASM 内存泄漏。

### 已发布 API

下列方法已在本地 `node_modules/verovio/dist/verovio.mjs` 中确认；对象参数由包装器 JSON 序列化。

| 类别 | 方法 | 用途 |
| --- | --- | --- |
| 生命周期 | `new VerovioToolkit(module)`, `destroy()` | 创建/释放实例。 |
| 加载 | `loadData(data)`, `loadZipDataBase64(data)`, `loadZipDataBuffer(buffer)` | 加载文本或 ZIP；返回假时读日志。 |
| 选项/布局 | `setOptions`, `getOptions`, `getDefaultOptions`, `getAvailableOptions`, `resetOptions`, `redoLayout`, `redoPagePitchPosLayout` | 设置并重算版面。 |
| SVG | `renderToSVG(pageNo?, xmlDeclaration?)`, `renderData(data, options)`, `getPageCount()` | 生成 SVG；页码从 **1** 开始。 |
| 导出 | `renderToMIDI()`, `renderToPAE()`, `getMEI(options?)`, `getHumdrum()` | MIDI 是 data URL，不是音频。 |
| 时间 | `renderToTimemap(options?)`, `getElementsAtTime(ms)`, `getTimeForElement(id)`, `getTimesForElement(id)`, `getMIDIValuesForElement(id)` | 播放光标和事件时间。 |
| 结构 | `getElementAttr`, `getPageWithElement`, `getNotatedIdForElement`, `getExpansionIdsForElement` | SVG/展开事件回到 MEI。 |
| 反复/编辑 | `renderToExpansionMap()`, `select`, `edit`, `editInfo` | 编辑协议须另按官方编辑器文档设计。 |
| 转换/诊断 | `convertMEIToHumdrum`, `convertHumdrumToHumdrum`, `convertHumdrumToMIDI`, `validatePAE`, `getLog`, `getVersion`, `getDescriptiveFeatures`, `resetXmlIdSeed` | Humdrum 转换依赖对应构建。 |

### 选项规范

先调用 `getAvailableOptions()` 取得**当前版本**的全量选项及允许值；不可从旧文章硬编码枚举。常用选项：

| 选项 | 意图 | 规范 |
| --- | --- | --- |
| `pageWidth`, `pageHeight` | 页面尺寸 | 按容器/媒介稳定设置。 |
| `scale` | 雕版缩放 | 会影响布局，变更后必须重排。 |
| `breaks` | 换行策略 | `encoded` 用已编码 `sb/pb`；一般用 `auto`。 |
| `adjustPageHeight` | 自动页面高度 | 连续长谱可用。 |
| `pageMarginTop`, `header`, `footer` | 页面装饰 | Web 嵌入常用 `header/footer: 'none'`。 |
| `svgViewBox` | 响应式 SVG | Web 嵌入建议开启。 |
| `fontAddCustom` | 自定义字体 | 生产环境使用受控本地资产，不依赖同步远程下载。 |

`scale` 不是 CSS 缩放的替代品。它影响雕版；CSS 只缩放已生成 SVG。容器宽度变化应做防抖后更新 `pageWidth` 并重新排版。

### 播放高亮

```ts
const now = toolkit.getElementsAtTime(elapsedMilliseconds)
const ids = [...(now.notes ?? []), ...(now.chords ?? [])]
const milliseconds = toolkit.getTimeForElement('n1')
const map = toolkit.renderToTimemap()
```

- `getElementsAtTime()` 的 `notes`、`chords`、`rests`、`measure`、`page` 均可能缺失，调用方必须兜底。
- 同一记谱元素在反复中会有多个实际时间，使用 `getTimesForElement()` 或 `renderToExpansionMap()`；不要假定单一时间。
- `xml:id` 是 MEI、SVG、播放高亮和源映射的契约，必须稳定且不能在每次渲染时随机化。

## 5. 生成与调试清单

- MEI 作为内部规范格式，其他格式只作为输入/输出边界。
- 所有被引用、选择或高亮的 note/chord/rest 都有唯一 `xml:id`。
- 先建 `scoreDef` 和全量 `staffDef`，再写 `measure/staff/layer`。
- 先 `setOptions` 再 `loadData`；失败时停止并采集 `getLog()`。
- MEI 改变后重新 `loadData`；布局选项改变后 `redoLayout()` 或重新加载，随后重读页数。
- SVG 导出时不要通过字符串替换破坏 `id`、`viewBox` 或命名空间。
- 排错顺序：最小骨架复现 -> 查命名空间/闭合标签/重复 ID/悬空引用/时值 -> 记录 `getLog()`、`getVersion()` 和 options -> 查询官方来源。

## 6. 官方来源与刷新规范

1. Verovio Book（官方使用手册）：<https://book.verovio.org/>。
2. Verovio 官方仓库与示例：<https://github.com/rism-digital/verovio>。
3. 本地安装的官方 npm 发布物：`node_modules/verovio/README.md`、`node_modules/verovio/dist/verovio.mjs`。
4. Music Encoding Initiative Guidelines（MEI 元素、属性、语义的规范性来源）：<https://music-encoding.org/guidelines/>。

升级 Verovio 后，先运行下列检查，再只更新有官方来源支撑的方法、选项和示例：

```ts
const toolkit = new VerovioToolkit(await createVerovioModule())
console.log(toolkit.getVersion())
console.log(toolkit.getAvailableOptions())
toolkit.destroy()
```

MEI Guidelines 中合法的元素不保证当前 Verovio 完整实现；Verovio 能容错渲染也不证明 MEI 合法。两者均须分别验证。

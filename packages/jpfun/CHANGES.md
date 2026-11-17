# Local changes

- Range-parenthesis occupancy includes measured left bearings and right overhang.

- Local ossia lanes clear horizontally overlapping painted primitives pair by pair. Music-font-relative clearance is independent of tall bars or surrounding text; nominal glyph padding and remote extrema no longer create invisible obstacles. Ordinary track envelopes and paint order remain unchanged.

- Anchored text clamps and clears the union of its logical advance and actual painted overhang. Per-line text occupancy uses measured bearings and the real advance for each alignment; inline text retains its logical spacing width.

- Framed text preserves its inset outside the union of advance and painted ink, including negative bearings and right overhang. All three alignments and individual line positions share the measured geometry.

- Pagination always keeps natural system gaps, including full and explicitly closed pages. Removed the page-justification branch and the `@pagebreak` / `@pb` justification argument; page capacity determines breaks only. Repeated, parallel, blank-page, footer, playback and second-pass attachment behaviors remain covered.

- Volta labels center their measured ink within the hooks, without the former fixed 2px baseline shift. Hooks derive from visible label height; strokes and the separation of adjacent hooks scale with the music size. Each fragment measures its actual line/hook/text commands, including label overhang and half strokes. Continuation fragments no longer reserve unpainted hooks or labels.

- Header side-cell packing and collision prediction now share the union of layout advance and painted ink bounds. Measured overhang stays inside page margins and outside the configured item gap from either edge.

- Automatic header side clearance reads individual painted primitives, including range octave dots and accidentals, instead of note-body boxes or whole composite rectangles. Text bearings and visible ink height participate in the same collision rule.

- Grace wrappers explicitly forward the sounding host’s tie port even when that host has no specialized upper port. Aligned ties check measured paint primitives, including endpoint accidentals and grace groups, and recheck after outer-arc placement. Text ink bearings/advance are available independently of existing layout widths; stroke-only frames retain their empty interiors during collision measurement.

- Metronome units 1 and 2 use hollow whole/half-note outlines with transparent counters instead of filled quarter notes. Tempo occupancy includes the complete lower flag edge for short measured text (notably unit 64), while alignment continues to use the measured text center. QPM playback and beat-unit/dot conversion are unchanged.

- Grace subdomains retain natural rhythmic clearance scaled from the parent music size, using the joined-beam spacing ratio. Previously compact local layout forced every inter-note margin to zero. The group stays rigid; host composition, source order, local horizontal hooks, frame padding, nested relation ownership, repeat layout and playback remain intact.

- Automatic measure wrapping resolves equal-energy partitions deterministically, preferring longer earlier rows within a normalized 1e-12 tolerance. A suffix dynamic program removes dependence on traversal order and cumulative-coordinate round-off; real cost differences, section preferences, minimum clearances and the 48-measure search limit remain intact.

- `@bar(3,preceding=1)` preserves a shared preceding double bar through serialization. Automatic wrapping restores that closing style on the previous system when the opening repeat moves to a new system; same-line rendering and repeat playback are unchanged.

- `@head(...,sideauto=true)` measures the complete packed side rows and their item gap: fitting sides share a top edge, while actual horizontal conflicts put the right side above the left. It replaces viewport thresholds in the M3N header adapter and preserves the setting through serialization.

- Inline `@text` uses an independent source-order zero-time column, preventing parallel music from merging into its column and separating simultaneous notes. Header text keeps shared columns within `@head` so parallel title rows remain centered.

- `@key(...,visits="1:C4;2:Db4")` displays visit-specific keys as a vertically centered, measured group of rows. It uses the ordinary key font, size and accidental glyphs, with a numeric visit prefix; only the supplied primary key sets timeline state. Rows participate in wrapping and system height, and serialization preserves them.

- `@key(...,degree=6)` displays the minor tonic as `6=` while retaining the supplied pitch as the numbered `1` reference. The default remains `degree=1`; note spelling and timeline state use the same reference in both modes.

- `@ossia(host, alternative)` creates a local parallel track below the main music and its lyrics. Empty systems collapse that track, and outer lyric collection excludes alternative notes. The adapter uses it for small parenthesized replacement melodies with independent lyric counts.

- `@note(...,showacc=false)` hides only the accidental glyph and its reserved width. Resolved pitch, octave, timing and playback remain intact; serialization preserves the flag. The M3N adapter uses it for redundant same-degree, same-octave accidentals within a measure.

- `@dyn(...,below=true)` places hairpins below their complete note range, including low octave dots, and reserves that space across systems. The default above-note placement and playback are unchanged; serialization preserves the option.

- Automatic beams follow the active meter, grouping compound 6/8, 9/8 and 12/8 in threes. Meter changes and bar lines reset the beat grid; line breaks inside metered bars preserve its phase. Explicit beams and shared div scopes retain their specified groups.

The comparison base is the unmodified upstream import commit `d7c00a6`. See UPSTREAM.md for the exact upstream revision. Modified upstream source files carry M3N notices.

- `@text(...,frame=true)` draws a native inline rectangular label with measured padding. It remains a zero-time object without lyric ports or relationship attachments, so it reserves horizontal space beside the following music without changing lyric slots, playback or lyric baselines. Serialization preserves the option.
- Natural-width `compileScore({autoWrap:true,wrap:"compact"})` uses a tighter line-breaking budget, allowing more measures per system while retaining native glyph, lyric and relation layout. Equal-measure compact wrapping retains its sparse-long-note guard. Normal wrapping remains unchanged; compact exports require geometry review.
- `compileScore({noteGap:4.4})` optionally sets the natural clearance of timed objects in pixels (the quarter-note reference is split across two sides; native square-root duration scaling and beam-specific margin ratios are preserved). Natural wrapping and final solving use the same gap; lyric and decoration constraints, page justification and local ornament layouts remain intact. The value must be finite and non-negative. Omitting it preserves default spacing; it is not a fixed final glyph clearance.
- Natural-width compact wrapping treats natural spring overflow as compressible: its squared overflow cost uses weight 1 instead of the normal-mode weight 100, within the existing 1.16 capacity. This allows an extra measure when the solver can tighten clearance, rather than justifying an unnecessarily sparse line. Normal/equal-measure wrapping and full-width justification are preserved.
- Paired `minimumNoteGap` / `noteGap` options measure minimum and natural layouts separately. Automatic wrapping tests complete measures and dense fragments against actual minimum occupancy, while scoring natural slack/compression; the minimum layout replaces the fixed capacity multiplier. Final solving reserves minimum spring clearance between columns and keeps the remaining natural clearance compressible. Exterior line edges keep their native flush alignment, including equal-measure exercises. Both references scale timed notes/rests/dashes and zero-time bars/controls consistently, preserving native rhythm and beam ratios. Optional API: existing calls keep their prior behavior.
- Workspace packaging and core-only application entry; original source, tests and snapshots retained. Optional importers are not exported to the browser application.
- `@paren(from,to)` adds native round parentheses around a same-track musical range, including single notes, rests and folded chords. Each visible system fragment reserves the measured glyph widths with a compact gap and paints ordinary parentheses in the numeric font and size on the music axis, without stretching around octave dots or decorations; automatic wrapping, explicit breaks and pagination preserve the range without changing playback. Existing scores are unchanged unless the function is used.
- `@voices(...,repeatconnect=true)` repeats native voice connectors on every system, including explicit breaks, automatic wrapping and pagination. Zero-time continuation hosts reserve horizontal space without repeating voice labels or changing playback; omitting the option retains upstream behavior.
- Copied the two upstream score fixtures into test/fixtures; updated their relative test path.
- `compileScore({equalMeasures:true})` optionally divides each music system into equal-width measure cells. Complete-line horizontal hooks reserve lyrics and parentheses before each cell is solved with the native spring solver; parallel voices share bar anchors. Automatic wrapping budgets the widest measure, while dense-measure splitting, explicit breaks, tuplets, repeats, pagination, source spans and playback remain intact. Default spacing is unchanged.
- Paired spacing in equal-measure cells relies on the minimum clearance already included in element widths, avoiding a second bar inset. Equal bar anchors, complete glyph clearance, playback and legacy unpaired spacing are preserved.
- Equal-measure cells without paired spacing reserve 0.55 times the complete bar height on both sides of each bar glyph, including repeats, so clearance scales with note size. `compileScore({wrap:"compact"})` optionally compresses natural spring space only for equal-measure candidates containing sparse sustained notes (at most four timed nodes per measure, each at least one beat, without wide lyric constraints); fast passages retain normal wrapping and playback.
- `compileScore({autoWrap:true})`: generic natural-width measurement and balanced measure breaking; dense measures split at note columns, preserving tuplet ranges, explicit breaks, parallel voices and original source spans. Default compilation is unchanged.
- The layout result exposes solved horizontal occupancy, including lyrics. Automatic wrapping uses this occupancy so long words do not get compressed into their neighbors.
- `compileScore({alignRelations:true})` aligns consecutive tuplet brackets and volta rules within each staff/system, and shares automatic arc heights between adjacent ties while preserving note endpoints and explicit heights. Semantic gaps and nesting separate alignment groups; nested sibling content can be previewed for clearance without becoming an earlier document obstacle. The default retains local relation positioning.
- With relation alignment enabled, overlapping `@tie` ribbons use declaration order for inner/outer layering. Later arcs move vertically to clear earlier arcs, including shared endpoints and cross-system/page fragments, and reserve the resulting height. Adjacent spans and different staves keep their ports; explicit arc heights and playback remain unchanged.
- Same-staff/system arcs level both ends at the higher musical port and use symmetric control points. The complete lower edge clears intervening notes and octave dots with only the necessary vertical translation, including cross-system fragments. Cross-staff arcs and default compilation retain their original geometry.
- Folded `up` tie ports target the highest musical member rather than a zero-time trill, text or control symbol. Tied folds reserve room for their arc below those upper marks; chord-member labels and upper octave dots retain their own ports.
- `@set(lyricspacing="reserve")` reserves opening/closing punctuation during lyric spacing. The upstream default keeps hanging punctuation behavior.
- `@voice(...,compactlyrics=true)` also packs absent verse slots locally, allowing separate endings on one system to begin at the same lyric baseline. Explicit zero-width syllables retain their verse alignment; semantic verse numbers and playback remain intact.
- `@voice(...,compactlyrics=true)` collapses lyric rows with no visible text on each system and track. Blank placeholders retain their original row/source metadata for playback without reserving horizontal or vertical space; visible rows retain their order and names. The default preserves upstream row spacing.
- `@spacing({music},group="paragraph")` limits `compileScore({uniformSystemHeight:true})` envelopes to that paragraph, including automatic wraps and page breaks. Omitted groups retain whole-score sharing. Music bodies and lower edges are shared only within a group, with separate upper reservations for plain and volta systems. Mixed systems reserve the union of their active groups; time, playback and event identity remain unchanged.
- `@text(...,above=label,local=true)` reserves heading space only on its actual system. Such text stays above music and relationships without joining the music envelope maximum. Its inner gap is 0.4 times the heading size, leaving inter-system separation to the configured page gap. Unmarked text keeps the previous behavior.
- `compileScore({uniformSystemHeight:true})` uses a shared music body and lower edge within each group, with separate uniform upper reservations for plain systems and systems carrying volta brackets. Cross-system bracket fragments, including intermediate systems and annotations above a bracket, reserve the taller band only where the bracket is present. Lyrics add only their actual visible rows; page justification stays disabled. Default natural spacing is unchanged.
- `@voice(...,lyricunderlines="0:0,1:2")` optionally underlines specific lyric row/slot pairs (zero-based). The native painter and layout occupancy include the underline; serialization preserves the option. Existing lyrics render unchanged without the option.
- `@voice(...,lyricprefixes="{\"0:0\":\"1.\",\"1:0\":\"2.4.\"}")` optionally places separate labels before lyric row/slot pairs. Labels reserve left-side space while the syllables remain centered on their notes; SVG metadata distinguishes labels from lyric text and serialization preserves them.
- Automatic wrapping moves simultaneous key/meter/tempo controls with their following note using one break per track. Opening repeat bars travel with the following measure rather than remaining at the end of the previous system.
- Oversized measures balance their fragments across lines and prefer whole-beat boundaries, avoiding short orphaned tails. Automatic breaks before a tuplet are inserted outside the complete group, preserving its duration and bracket.
- `@br(soft=true)` marks preferred automatic break boundaries without forcing a new system. Wrapping balances section boundaries against unused space so short introductions may share their following section; ordinary `@br()` remains mandatory. Automatic repeat-boundary breaks retain a closing bar on the preceding system and split shared end/start repeats, preserving source spans, decorations and playback order.
- Volta brackets include their closing boundary bar when measuring vertical clearance, keeping D.S./D.C./Fine and other bar decorations below the bracket and its hooks, including across systems.
- `@bar(...,before={...})` optionally places zero-time symbols or text before the bar on the music axis. Their full width participates in wrapping and the bar anchor remains on its stroke; folded navigation symbols retain their playback hooks. Bars without inline content retain upstream geometry.
- Optional painter object callbacks and SVG attribute callbacks support event identity and lyric source/row metadata. Music coordinates and engraving remain native. Metadata is non-enumerable so visual styles and upstream recordings are unchanged.
- Added native staccato, tenuto, staccatissimo and breath symbols.
- `@tempo(...,font="...")` optionally overrides the numeric font for measurement and painting, preserving it in serialization. Omitting the option retains the upstream text-font default.
- `@head(...,sidebelow=true)` places both side slots below the complete center block with the configured row gap, preventing subtitle collisions. The default retains upstream positioning below the first center row.
- `@head(...,itemgap=16px)` configures horizontal spacing between side-row items; the default remains 0.25em. `sidestacked=true` places the right slot above the left slot with the configured row gap, so narrow score credits can clear key, meter and tempo controls. Both options survive serialization and use native track geometry.
- `@text(...,above=label)` optionally anchors zero-time text above a visible host and previously registered musical relations. Annotations reserve vertical space, follow their host through wrapping/pagination, stay inside the page margins and expose optional source metadata; ordinary text keeps its upstream geometry.
- `@text(...,weight=700)` optionally sets text weight for both measurement and painting, preserving it in serialization. Omitting the option retains regular text and upstream recordings.
- `@dyn(...,single=true)` permits a short hairpin over one event using native attachment geometry. The upstream default still rejects zero-time intervals. M3N playback continues to use the Verovio timeline.

- `@tempo(...,unit=4,dots=0)` selects the engraved beat unit independently of QPM. Compound meter uses a dotted beat; eighth-note marks include flags. Playback remains in quarter notes.

Local regression tests: test/m3n-wrapping.test.ts, test/m3n-metadata.test.ts, test/m3n-equal-measures.test.ts and test/m3n-uniform-spacing.test.ts. Application semantics and corpus tests live in @m3n/numbered-notation; real browser geometry checks are run by `npm run test:numbered-layout` at the workspace root.

- 新增 `compileScore({wrapWidthRatio})`：仅缩小自动换行的参考宽度，最终版心、字形与源码身份保持；供谱集根据页面余量反馈试排。

- Centered text accounts for measured ink bearings instead of assuming its advance width is visually symmetric; the center slot remains independent of side widths. Long numbered-score titles wrap at the measured page width while preserving their font size.

- Alternative tracks use host occupancy within their own horizontal footprint. A second lyric row in another bar no longer reserves a blank row above a local alternative; nearby lyrics, relations and previously placed branches still participate in clearance. Other track arrangements retain their system-wide envelope.

- `@br(gap=12)` 可设置换行前的额外像素间距；参与页面容量计算，页首不保留。

- `@note(...,displayonly=true)` 绘制零时长的说明音符，保留数字、变音记号和八度点的原生布局，可用于谱头音域；不发声，序列化保留此选项。

- `@symbol(...,above=host)` attaches a symbol above its labeled host and previously declared relations without adding a time column. Dynamic state changes apply at the host onset, including its tuplet siblings; navigation and playback-action symbols must remain temporal objects and are rejected as anchored decorations. Symbol size and the host label survive serialization. The numbered adapter uses these attachments for tuplet ornaments and dynamics so the bracket stays closer to the notes.

- With relation alignment enabled, slurs also clear previously laid out tuplet brackets on the same track. Clearance uses the bracket's measured region and the ribbon's lower edge over their shared horizontal span; the rhythm bracket keeps its position nearer the notes.

- Canvas text measurement now caches actual ink ascent/descent and centering bearings together with advance, resets the Canvas alignment/baseline, and invalidates all metrics on font-resource changes. Offline or advance-only hosts retain an explicit estimate; a measured zero-height space remains empty. Multi-line text reserves the union of every line's ink while retaining its requested baseline advance. Division strokes clear the body's painted bottom by 0.12 music em; estimated em boxes expose their estimated ink bottom separately so offline trailing blank space is not counted twice.

- Fraction numerals center their measured ink on the meter rule independently; asymmetric bearings no longer shift the numerator or denominator away from its anchor.

- Note digits center their measured ink on the musical anchor and octave dots after pitch resolution, including letter-name conversion and X. The shared zero-based note width and empty-note behavior remain intact.

- Lyric visual tiers now share baselines derived from their actual token, prefix and row-name ink, rather than a surrogate M or nominal font-size advance. Complete descenders and measured underline strokes participate in inter-row clearance and frame-owned lyric stacking. Invisible compact slots and verse metadata retain their existing behavior.

- Aligned ties and slurs clear painted zero-time controls and bar labels throughout their system, including text whose ink overlaps the arc from outside its temporal endpoint interval.

- Tuplet brackets measure the actual count, rules and hooks separately, including stroke width and text bearings. Side accidentals only raise primitives that cross their ink; adjacent brackets share the required clearance. Count ink stays visually centered, and reserved bounds include all painted primitives. Nested brackets and enclosed content retain their inner-to-outer ordering.

- Note accidentals reserve their actual path extrema and stroke through local intrinsic ink bounds. Complete host/track and subdomain occupancy includes this footprint without moving the numeral axis, shoulder, octave decorations or beam ports; grace and folded chords inherit it through normal measured bounds. Each preparation resets the footprint.
- Arc endpoints use the painted musical center rather than accidental side ink. Tuplets establish their initial level from body/nested-content bounds, then clear side ink against each actual bracket primitive; full system and page occupancy still includes all accidental ink.
- With relation alignment enabled, middle-system arc continuations start from musical ports/central painted heads rather than the system envelope. Bar lines and side accidentals remain real collision obstacles; empty systems retain their track-envelope fallback.

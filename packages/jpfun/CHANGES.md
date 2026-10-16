# Local changes

The comparison base is the unmodified upstream import commit `d7c00a6`. See UPSTREAM.md for the exact upstream revision. Modified upstream source files carry M3N notices.

- Workspace packaging and core-only application entry; original source, tests and snapshots retained. Optional importers are not exported to the browser application.
- Copied the two upstream score fixtures into test/fixtures; updated their relative test path.
- `compileScore({autoWrap:true})`: generic natural-width measurement and balanced measure breaking; dense measures split at note columns, preserving tuplet ranges, explicit breaks, parallel voices and original source spans. Default compilation is unchanged.
- The layout result exposes solved horizontal occupancy, including lyrics. Automatic wrapping uses this occupancy so long words do not get compressed into their neighbors.
- `@set(lyricspacing="reserve")` reserves opening/closing punctuation during lyric spacing. The upstream default keeps hanging punctuation behavior.
- `@voice(...,lyricunderlines="0:0,1:2")` optionally underlines specific lyric row/slot pairs (zero-based). The native painter and layout occupancy include the underline; serialization preserves the option. Existing lyrics render unchanged without the option.
- `@voice(...,lyricprefixes="{\"0:0\":\"1.\",\"1:0\":\"2.4.\"}")` optionally places separate labels before lyric row/slot pairs. Labels reserve left-side space while the syllables remain centered on their notes; SVG metadata distinguishes labels from lyric text and serialization preserves them.
- Automatic wrapping moves simultaneous key/meter/tempo controls with their following note using one break per track. Opening repeat bars travel with the following measure rather than remaining at the end of the previous system.
- Oversized measures balance their fragments across lines and prefer whole-beat boundaries, avoiding short orphaned tails. Automatic breaks before a tuplet are inserted outside the complete group, preserving its duration and bracket.
- `@br(soft=true)` marks preferred automatic break boundaries without forcing a new system. Wrapping balances section boundaries against unused space so short introductions may share their following section; ordinary `@br()` remains mandatory. Automatic repeat-boundary breaks retain a closing bar on the preceding system and split shared end/start repeats, preserving source spans, decorations and playback order.
- Volta brackets include their closing boundary bar when measuring vertical clearance, keeping D.S./D.C./Fine and other bar decorations below the bracket and its hooks, including across systems.
- `@bar(...,before={...})` optionally places zero-time symbols or text before the bar on the music axis. Their full width participates in wrapping and the bar anchor remains on its stroke; folded navigation symbols retain their playback hooks. Bars without inline content retain upstream geometry.
- Optional painter object callbacks and SVG attribute callbacks support event identity and lyric source/row metadata. Music coordinates and engraving remain native. Metadata is non-enumerable so visual styles and upstream recordings are unchanged.
- Added native staccato, tenuto, staccatissimo and breath symbols.
- `@dyn(...,single=true)` permits a short hairpin over one event using native attachment geometry. The upstream default still rejects zero-time intervals. M3N playback continues to use the Verovio timeline.

Local regression tests: test/m3n-wrapping.test.ts and test/m3n-metadata.test.ts. Application semantics and corpus tests live in @m3n/numbered-notation; real browser geometry checks are run by `npm run test:numbered-layout` at the workspace root.

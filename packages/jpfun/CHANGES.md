# Local changes

The comparison base is the unmodified upstream import commit `d7c00a6`. See UPSTREAM.md for the exact upstream revision. Modified upstream source files carry M3N notices.

- Workspace packaging and core-only application entry; original source, tests and snapshots retained. Optional importers are not exported to the browser application.
- Copied the two upstream score fixtures into test/fixtures; updated their relative test path.
- `compileScore({autoWrap:true})`: generic natural-width measurement and balanced measure breaking; dense measures split at note columns, preserving tuplet ranges, explicit breaks, parallel voices and original source spans. Default compilation is unchanged.
- The layout result exposes solved horizontal occupancy, including lyrics. Automatic wrapping uses this occupancy so long words do not get compressed into their neighbors.
- `@set(lyricspacing="reserve")` reserves opening/closing punctuation during lyric spacing. The upstream default keeps hanging punctuation behavior.
- Optional painter object callbacks and SVG attribute callbacks support event identity and lyric source/row metadata. Music coordinates and engraving remain native. Metadata is non-enumerable so visual styles and upstream recordings are unchanged.
- Added native staccato, tenuto, staccatissimo and breath symbols.
- `@dyn(...,single=true)` permits a short hairpin over one event using native attachment geometry. The upstream default still rejects zero-time intervals. M3N playback continues to use the Verovio timeline.

Local regression tests: test/m3n-wrapping.test.ts and test/m3n-metadata.test.ts. Application semantics and corpus tests live in @m3n/numbered-notation; real browser geometry checks are run by `npm run test:numbered-layout` at the workspace root.

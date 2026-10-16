# jpFun source provenance

- Repository: https://github.com/madderscientist/jpFun
- Commit: `b41f1cb956bab98ed142372897d73da10baacc5d`
- Upstream package: `packages/jpfun`, version `0.6.0`
- Imported: 2026-10-16
- License: Apache-2.0; see [LICENSE](LICENSE).

The initial import preserves upstream `src/`, `test/`, README and grammar. The local package manifest builds the core entry with the workspace TypeScript compiler and runs upstream tests without the upstream monorepo bundling scripts. Optional MIDI/MusicXML importers remain in the source tree for provenance and upstream tests but are not exported to the application.

Upstream updates are reviewed and merged explicitly. Modified upstream files carry an M3N modification notice; local changes are tracked in CHANGES.md. The original source and this commit provide the comparison base.

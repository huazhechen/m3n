# Agent Instructions

## Documentation First

- For every documentation-related question or task, search and read `docs/` first. This includes API behavior, syntax, specifications, architecture, formats, and implementation guidance.
- Treat the material in `docs/` as the project's primary offline documentation source. Do not use web search before checking it.
- Use targeted local search (for example, `rg <term> docs`) and read the surrounding section rather than relying only on a matching line.
- Access the network only when the required information is demonstrably absent or outdated in `docs/`, or when the task explicitly asks to refresh or verify the upstream documentation.

## Completion Workflow

- When a task is complete and verification is finished, create a Git commit immediately. Do not wait for a separate request to commit.
- Do not start a development server for the user unless the user explicitly asks for one.

## Hosted Build Output

- This workspace is served by Code Shell from `dist/` at `/score/`. Read `docs/HOSTING.md` before building. Use `VITE_BASE_URL=/score/ VITE_SUBMIT_MODE=remote npm run build`, or an isolated output directory for build checks; never overwrite the hosted `dist/` with the default root-path build.

## Score Artifacts

- After editing a score or engraving dependencies, run `npm run prepare:scores` before committing. It updates score digests, per-score font subsets, shared library fonts and staff glyph metrics; see `docs/SCORE_ARTIFACTS.md`.
- Keep `.githooks/pre-commit` enabled (`npm run prepare` installs it). Stage complete score and engraving inputs before committing; do not bypass a failed generation hook.
- CI uses `npm run check:score-artifacts` to reject stale generated results.

## Memory Limit

- All project build, generation, test, and browser processes together must stay below 2 GB of memory.
- Run memory-intensive checks serially, including automatic hosted builds; do not overlap font generation, full tests, browser audits, or builds.
- Use one test worker and bounded Node heaps for verification. Monitor aggregate process memory and stop work before the limit is reached.

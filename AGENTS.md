# Agent Instructions

## Documentation First

- For every documentation-related question or task, search and read `docs/` first. This includes API behavior, syntax, specifications, architecture, formats, and implementation guidance.
- Treat the material in `docs/` as the project's primary offline documentation source. Do not use web search before checking it.
- Use targeted local search (for example, `rg <term> docs`) and read the surrounding section rather than relying only on a matching line.
- Access the network only when the required information is demonstrably absent or outdated in `docs/`, or when the task explicitly asks to refresh or verify the upstream documentation.

## Completion Workflow

- When a task is complete and verification is finished, create a Git commit immediately. Do not wait for a separate request to commit.
- Do not start a development server for the user unless the user explicitly asks for one.

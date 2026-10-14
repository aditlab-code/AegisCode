# AGENTS.md — AegisCode Agent Operating Guidelines

This file provides direct operational guidance for AI coding agents (Antigravity, Claude Code, Cursor, Copilot) working in this repository.

> **Objective**: Lightweight Web-Based IDE + Local Cross-Platform Go Server + Remote Tablet Companion  
> **Core Architecture**: Hybrid Layered Core with Out-of-Process Worker Supervision  
> **Prime Directive**: DO NOT OVER-ENGINEER. Keep all code lean, direct, and pragmatic.

---

## 1. Chain-of-Thought (COT) Execution with CodeGraph

All agents MUST follow a disciplined Chain-of-Thought execution cycle:
1. **Analyze**: Understand the requirements and explore the codebase using **CodeGraph Progressive Disclosure** (start broad, zoom in only when needed).
2. **Plan**: Formulate a concise step-by-step plan against project constraints.
3. **Execute**: Implement changes cleanly and modularly.
4. **Verify**: Run verification gates (`npm run build` & `npm run format`) to ensure zero errors.

### CodeGraph Progressive Disclosure (Token & Context Optimization)
Dumping entire source files or raw ASTs is an anti-pattern that leads to high latency and context window bloat. Agents MUST apply the **5-Level Progressive Disclosure Hierarchy** when navigating and inspecting code:

| Level Zoom | Granularity / Target | Token Budget | Agent Action |
| --- | --- | --- | --- |
| **L0: Outline** | File outline / skeleton | $< 150$ tokens | Inspect function lists, structs, interfaces, and exported types without reading bodies. |
| **L1: Signature** | Symbol definitions | $< 80$ tokens | Review function signatures, parameter lists, return types, and docstrings. |
| **L2: Topology** | Callers & callees (1-hop) | $< 120$ tokens | Trace direct dependencies and call hierarchy to assess change blast radius. |
| **L3: Surgical Subgraph** | Module dependency subgraph | $< 400$ tokens | Map multi-hop dependency relationships capped at depth 1–2 for affected modules. |
| **L4: Source Body** | Function / method body | Target size | Read only the specific target function/block when actively refactoring or modifying logic. |

### Shell Invocation Guidelines
Execute shell commands directly and natively without CLI wrappers:
- **Direct Execution**: Use standard commands (`npm run build`, `npm run format`, `git status`, `go test ./...`).
- **Compact Outputs**: Keep command outputs minimal and focused (e.g., `git log -n 5`, `head -n 20`, targeted file paths) to avoid context flooding.
- **Fail-Fast**: Break execution immediately on non-zero exit codes; never ignore or swallow command errors.

---

## 2. Core Development Constraints

### Frontend Constraints
1. **Reuse Tailwind Tokens**: All colors must use semantic tokens from [`src/styles/tokens.css`](src/styles/tokens.css) via Tailwind CSS v4 (`bg-canvas`, `bg-surface`, `text-ink`, `border-line`, `bg-accent`, etc.). Zero hardcoded hex colors allowed in TSX/CSS.
2. **Reuse UI Primitives**: Atomic UI components (`Icon`, `IconButton`, `Toast`) must be reused from [`src/components/ui/`](src/components/ui/). Do not duplicate primitives.
3. **Co-locate CSS**: Each layout module in [`src/components/layout/<name>/`](src/components/layout) owns its CSS stylesheet.
4. **Preserve Selectors**: Maintain existing class names and layout selectors 1:1.
5. **Universal On-Demand Code Splitting for All Viewers**: Non-code viewer panes (e.g. `@tldraw/tldraw` for `.canvas`/`.design`, PDF preview for `.pdf`, Markdown live preview for `.md`, Tabular/Spreadsheet viewer for `.csv`/`.tsv`/`.xls`/`.xlsx`, and Media Pan-Zoom for `.png`/`.jpg`/`.jpeg`/`.svg`/`.webp`) MUST NEVER be imported into the main initial bundle. Always load them via `React.lazy()` / dynamic `import()` triggered strictly on-demand when the user opens a matching file extension. During standard code editing, all specialized viewer runtimes, parsers, and canvas assets must consume zero RAM, remain unparsed, and never inflate application bundle sizes beyond 50MB+.

### Backend Constraints
1. **DO NOT Catch Errors Silently**: If an error occurs, break the function immediately and report the error explicitly. Never use empty catch/error blocks.
2. **DO NOT Write Spaghetti Error Handling**: Maintain exactly one clear, linear validation and error path per function.
3. **DO NOT Add Redundant Constants / Abstractions**: Check state mutability; avoid excessive wrapper classes, DDD boilerplate, or deep hexagonal layers. Keep packages flat in `server/internal/*`.
4. **Preserve `embed.FS` Fallback Stubs**: Always keep [`server/internal/web/dist/index.html`](server/internal/web/dist/index.html) tracked in git so clean checkouts can compile Go code and pass backend tests without requiring a prior frontend build.
5. **Fail-Safe Process & Port Teardown**: Ensure all test runners, dev servers, and desktop wrappers clean up child process groups on exit (`SIGTERM` + `SIGKILL` watchdog). Never leave orphaned background processes locking TCP ports (`8080`, `8081`, `5173`).
6. **DO NOT ADD** generated by, Co-authored-by, tool branding, signature, or similar attribution to commit

---

## 3. Mandatory Verification Gates

Before completing any task touching the codebase, the agent MUST run and pass:
```bash
npm run build    # Must pass with 0 errors
npm run format   # Code formatting check with oxfmt
```

---

## 4. Documentation References (`@docs`)

For detailed technical specifications, architecture decisions, and design references, consult the dedicated documentation in [`docs/`](docs):

- **Internal Docs Index**: [`docs/README.md`](docs/README.md)
- **Folder Hierarchy & Responsibilities**: [`docs/internal/architecture.md`](docs/internal/architecture.md)
- **Active UI Design & Layout Modules**: [`docs/internal/frontend.md`](docs/internal/frontend.md)
- **Milestones & Phasing (Phase 1–9)**: [`docs/internal/roadmap.md`](docs/internal/roadmap.md)
- **Backend Endpoints, DAP & Pairing**: [`docs/internal/feature-backend.md`](docs/internal/feature-backend.md)
- **Feature Assessment & RFC Scorecard**: [`docs/internal/report.md`](docs/internal/report.md)
- **Internal Installation & Setup**: [`docs/internal/installation.md`](docs/internal/installation.md)
- **Architecture Decision Records**: [`docs/adr/`](docs/adr)
- **Skills & Engineering Workflow**: [`docs/internal/skills.md`](docs/internal/skills.md)

---

## Agent skills

### Issue tracker

Local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`GLOSSARY.md` and `docs/adr/` at repo root). See `docs/agents/domain.md`.

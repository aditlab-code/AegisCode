# AegisCode Technical Architecture & Documentation Index

> **Objective**: Lightweight, Web-Based IDE with a Local Cross-Platform Go Backend and Remote Multi-Screen Tablet Companion.  
> **Core Architecture**: Hybrid Layered Core with Out-of-Process Worker Supervision.  
> **Guiding Principle**: Do Not Over-Engineer.

---

## Architecture Overview

AegisCode is an AI-assisted, lightweight local engineering workbench combining:
1. **Aegis Studio**: A fast, modular web-first IDE built with React 19, TypeScript, and Tailwind CSS v4.
2. **Go Core Server**: A cross-platform, single-binary local server embedding the production React 19 frontend via `embed.FS` (`server/internal/web`), providing terminal PTY management, file system watching, SQLite app storage, and bundled DAP debugging.
3. **Tablet Companion View**: A remote multi-screen mode over LAN (`/?mode=companion`) providing a running host web preview and a focused, touch-friendly code editor buffer.
4. **Resilient Worker Daemons**: Isolated out-of-process workers (LSP, PTY, AEGIS AI Agent) communicating via `stdio` and Unix Domain Sockets (`0600`) to guarantee editor UI responsiveness and crash resilience.

---

## Official Documentation Map (`docs/`)

The architecture documentation is decomposed into focused modules located in [`docs/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs):

| Document | Link | Focus Area & Description |
| :--- | :--- | :--- |
| **System Architecture** | [`docs/architecture.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/architecture.md) | High-level system architecture and folder-level ownership guide. |
| **Frontend UI Design** | [`docs/frontend.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/frontend.md) | UI layout reference organized by component layout folder, styling rules, and tokens. |
| **Engineering Roadmap** | [`docs/roadmap.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/roadmap.md) | Milestone progression tracking Phases 1 through 9. |
| **Backend & Features** | [`docs/feature-backend.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/feature-backend.md) | Go Core Server specifications, endpoints (REST/SSE/WS), DAP debugger, and pairing. |
| **Feature Assessment** | [`docs/report.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/report.md) | Feature evaluation scorecard, anti-over-engineering gates, and RFC checklist. |
| **Installation & Setup** | [`docs/installation.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/installation.md) | Quickstart guide, environment prerequisites, and single binary build steps. |
| **Architecture Decision Records** | [`docs/adr/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/adr) | Formal ADR records (0001–0008) detailing fundamental technology decisions. |

---

## Core Quality & Constraint Summary

- **Frontend**:
  - Always reuse semantic design tokens in [`src/styles/tokens.css`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/styles/tokens.css); never introduce hardcoded hex colors.
  - Always reuse atomic UI primitives from [`src/components/ui/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/ui).
  - Co-locate CSS inside layout module directories in [`src/components/layout/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout).
- **Backend**:
  - Never catch errors silently; fail fast and break the function to report explicit errors.
  - Avoid spaghetti try/catch blocks; maintain one clear validation path per function.
  - Avoid unnecessary constants or bloated abstractions; maintain a pragmatic, flat package layout.

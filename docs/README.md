# AegisCode Documentation Index

This directory contains internal technical specifications, architecture decisions, and agent guidelines for developing and maintaining AegisCode.

For end-user release documentation, please refer to the root release files:
* [README.md](../README.md) — Main overview & feature summary
* [INSTALLATION.md](../INSTALLATION.md) — Platform installation guide & test matrix
* [RELEASE_NOTES.md](../RELEASE_NOTES.md) — Community release notes for `v1.0.0-beta.1`
* [LICENSE](../LICENSE) — MIT License

---

## Internal Technical Specifications (`docs/internal/`)

| Document | Location | Purpose & Scope |
| :--- | :--- | :--- |
| **System Architecture** | [`docs/internal/architecture.md`](internal/architecture.md) | High-level system architecture, folder responsibilities, and hybrid core model. |
| **Backend & DAP Engine** | [`docs/internal/feature-backend.md`](internal/feature-backend.md) | Go Core Server endpoints, DAP debugger integration, process supervisors, and pairing. |
| **Frontend UI Reference** | [`docs/internal/frontend.md`](internal/frontend.md) | Layout modules, Tailwind CSS v4 design tokens, and viewer lazy loading rules. |
| **Engineering Roadmap** | [`docs/internal/roadmap.md`](internal/roadmap.md) | Phased delivery tracker from Phase 1 through Phase 9. |
| **Feature Assessment Scorecard** | [`docs/internal/report.md`](internal/report.md) | Anti-over-engineering gates, evaluation scorecards, and RFC validation checklists. |
| **Append-Only Chat Ledger RFC** | [`docs/internal/rfc-append-only-chat-graph-ledger.md`](internal/rfc-append-only-chat-graph-ledger.md) | RFC for the append-only event ledger and conversation branch graph storage. |
| **Internal Development Setup** | [`docs/internal/installation.md`](internal/installation.md) | Internal workstation build guide, Delve prerequisites, and toolchains. |
| **Skills & Workflows** | [`docs/internal/skills.md`](internal/skills.md) | Engineering skills, slash commands, and agent execution playbooks. |

---

## Architecture Decision Records & Agents

* **Architecture Decision Records**: [`docs/adr/`](adr/) — Formal ADRs detailing foundational decisions (ADR-0001 through ADR-0011).
* **Agent Guidelines & Triage**: [`docs/agents/`](agents/) — Issue tracker schemas, triage labels, and domain models.

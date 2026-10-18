# VantageCraft CodeGraph Visual Guide (Optional External Tooling)

> [!NOTE]
> **Optional External Tooling (Phase 26+)**:  
> CodeGraph is an **optional, standalone codebase visualization tool**. AegisCode Core does not bundle or require an active CodeGraph background daemon; all core code navigation, document symbols, definitions, and outlines in the IDE workbench are powered directly and natively by **Language Server Protocol (LSP)** (`/api/v1/lsp/*`) and fast Go workspace indexing.  
> Users and AI agents are free to run CodeGraph independently via CLI or launch its UI standalone whenever macro architecture visualization is desired.

---

## 1. Running Standalone CodeGraph

To launch the VantageCraft CodeGraph interface independently for your workspace:

```bash
# Start the standalone CodeGraph UI daemon in your terminal:
npx @colbymchenry/codegraph ui --port 3333

# Or explore symbols and call graphs directly from the CLI:
npx @colbymchenry/codegraph explore "symbol or query"
```

Once running, navigate to `http://127.0.0.1:3333` in your browser to inspect the visual graph.

---

## 2. The 6 VantageCraft Views

```mermaid
flowchart TD
    E[1. Entrypoints & Programs] --> S[2. Execution Steps]
    E --> M[3. Architecture Map]
    S --> F[4. Directed Flow & Trails]
    E --> SC[5. Screens & Events]
    F --> D[6. Bounded FileCode Drawer]
```

### 1. Entrypoints & Program Explorer
- **Landing View**: Grouped catalog of HTTP Routes & APIs, UI Screens, Main Binaries, Hub Symbols, and Test Suites.
- Displays HTTP methods (`GET`, `POST`, `PUT`, `DELETE`), framework annotations (Gin, Express, Next.js, etc.), and dependent counts.
- Clicking any entrypoint opens its **Execution Steps View**.

### 2. Execution Steps View
- **Spine Tree**: Sequential execution flow starting from a chosen anchor function or route.
- **Tier Classification**: Color-coded tiers (`Handler/Controller` $\rightarrow$ `Service/Logic` $\rightarrow$ `Repository/Store` $\rightarrow$ `External/IO/DB`).
- **Branch Guards (`when`)**: Displays boolean guard pills (`if`, `switch`, `try/catch`) required to enter a call branch.
- **Side Effects Badges**: Labeled pills for database operations (`DB Read`, `DB Write`), network calls, and event emissions.
- **Synthesized Hops**: Dashed connectors highlighting dynamic runtime bridges.

### 3. Architecture Map View
- **Macro Module Graph**: Compound directory and package visualization.
- **Zero-Freeze Offloading**: Layouts (Dagre/ELK) are calculated inside a Web Worker off the main thread.
- **Proportional Weight**: Edge thickness scales with the number of cross-module calls and declared imports.
- **Toggles**: Quickly isolate or hide test suites and tool-generated files.

### 4. Directed Flow & Trails View
- **3-Column Focused Blast Radius**: Upstream Callers (Left) $\rightarrow$ Focused Symbol (Center) $\rightarrow$ Downstream Callees (Right).
- **Source Window Cards**: Displays 7-line code snippets centered around the connecting call site.
- **Dynamic Boundary Detection**: Flags runtime dispatch boundaries and unresolved dynamic callbacks.

### 5. Screens & Events View
- **UI Screen Transitions**: Interactive state machine mapping frontend pages/screens to routes and backend handlers.
- **Triggers & Events**: Inspects user gestures (`onClick`, `onPress`) and their downstream API dispatch targets.

### 6. Bounded FileCode & Symbol Drawer
- **Fast Bounded Inspection**: Inspects function line ranges, file outlines, and intra-file call arcs without loading multi-megabyte source files into the graph canvas.
- **Jump to Editor**: Opens the file in `CMEditor.tsx` at the exact line and column.

---

## 3. Freshness & Synchronization

- **Fast Git Sync**: The top bar includes a **Sync** button for incremental index synchronization of modified files via Git diff.
- **Re-index**: Triggers a clean 4-phase re-index across the entire workspace repository.

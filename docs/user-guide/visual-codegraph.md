# Visual CodeGraph Navigation

AegisCode includes an interactive **Visual CodeGraph** canvas powered by **Cytoscape.js**. It turns your codebase's Abstract Syntax Tree (AST) into a live, explorable structural map.

---

## 1. Opening & Navigating the CodeGraph

Open the CodeGraph panel by clicking the graph icon (`🕸️`) in the Activity Bar or pressing `Cmd + G` / `Ctrl + G`.

### Canvas Controls
* **Pan**: Click and drag on empty canvas space.
* **Zoom**: Use the scroll wheel or trackpad pinch gesture.
* **Fit to Screen**: Click the **Fit** button (`⛶`) to re-center and fit the entire graph into view.
* **Filter by Kind**: Use the filter dropdown to isolate functions, structs, interfaces, or variables.
* **Symbol Search**: Type into the search input at the top of the canvas to quickly locate and center on any symbol.

---

## 2. Layout Modes: Dagre vs CoSE

AegisCode provides two complementary graph layout algorithms:

### 1. Hierarchical Layout (Dagre)
* **Purpose**: Visualizes call flows, architectural layering, and dependency direction.
* **Structure**: Nodes are organized top-to-bottom or left-to-right according to caller/callee or importer/imported hierarchies.
* **Best For**: Understanding execution pipelines (e.g., HTTP Handler -> Service -> Store -> Database).

### 2. Clustered Layout (CoSE - Compound Spring Embedder)
* **Purpose**: Reveals natural architectural cohesion and tightly-coupled symbol communities.
* **Structure**: Nodes attract and repel using physics-based force simulation, clustering related symbols into visual modules.
* **Best For**: Discovering module boundaries, domain clusters, and refactoring targets.

---

## 3. Visual Symbol Taxonomy

Nodes in the CodeGraph are color-coded and badged according to their AST symbol classification:

| Symbol Kind | Visual Color | Badge | Description |
| :--- | :--- | :---: | :--- |
| **Function / Method** | Sky Blue | `fn` | Executable functions, constructors, and receiver methods |
| **Struct / Class** | Emerald Green | `struct` | Concrete data models and object structures |
| **Interface** | Amber / Orange | `intf` | Abstract contracts, type definitions, and protocol bounds |
| **Variable / Constant**| Slate Purple | `var` | Global variables, enum constants, and exported singletons |
| **File Node** | Neutral Gray | `file` | Parent file containing the symbols |

---

## 4. Jump-to-Source & Editor Cursor Synchronization

The CodeGraph is deeply integrated with the active CodeMirror editor:

### Double-Click: Jump to Source
* **Double-clicking** any node immediately opens the defining file in the editor and jumps your cursor to the exact line and column where the symbol is declared.

### Editor Cursor Focus
* When you place your cursor inside a function or struct in the editor, the CodeGraph automatically highlights the corresponding node with a pulsing halo, showing you where you are in the broader architecture in real-time.

---

## 5. Live AI Trace Event Highlighting

When an AI Assistant tool call queries the CodeGraph via MCP (e.g. `get_symbol_definition`, `find_callers`, or `query_subgraph`), the CodeGraph illuminates the queried nodes in real-time:

* **Active Glow**: Nodes accessed by the AI pulse with an accent color.
* **Trace Path**: Edges traversed during dependency or caller lookups light up sequentially.
* **Auditing**: You can visually inspect exactly which parts of your codebase the AI examined to formulate its answers.

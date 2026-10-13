# Plugin & Extension Development Guide

AegisCode is built to be extensible without compromising on performance or bundle bloat. This guide covers creating custom UI panels, connecting external AI agents to AegisCode's MCP server, and adding custom language AST parsers.

---

## 1. Connecting External AI Agents via MCP

You can expose AegisCode's fast CodeGraph and symbol search engine to third-party AI agents such as **Cursor**, **Claude Code**, or **Windsurf**.

### Configuration for Claude Code / Claude Desktop
Add AegisCode's MCP stdio runner to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aegiscode": {
      "command": "/absolute/path/to/bin/aegiscode-darwin-arm64",
      "args": ["--mcp-stdio", "--workspace", "/path/to/your/project"]
    }
  }
}
```

### Configuration for Cursor
In **Cursor Settings -> Features -> MCP**, add a new server:
- **Name**: `AegisCode CodeGraph`
- **Type**: `command`
- **Command**: `/path/to/bin/aegiscode-darwin-arm64 --mcp-stdio`

Now, external agents can invoke `get_file_outline`, `get_symbol_definition`, `find_callers`, and `query_subgraph` directly inside their conversations.

---

## 2. Building Custom UI Panels

AegisCode layout modules are decoupled into modular slots. To build a custom panel (e.g. an API tester or custom database explorer):

### 1. Structure
Create your module under `src/components/layout/<your-plugin>/`:
```text
src/components/layout/my-panel/
├── MyPanel.tsx
├── MyPanel.css
└── useMyPanelStore.ts
```

### 2. Constraints & Best Practices
* **CSS Co-Location**: Style the panel using local CSS and Tailwind CSS v4 semantic tokens (`bg-canvas`, `bg-surface`, `text-ink`, `border-line`).
* **Zero Initial Bundle Overhead**: If your panel relies on heavy external libraries (e.g. spreadsheets, 3D viewers), always load the panel via `React.lazy()`:
  ```tsx
  const MyPanel = React.lazy(() => import("./MyPanel"));
  ```
* **Communicate via REST & SSE**: Use `fetch("/api/v1/...")` to talk directly with the Go backend rather than establishing external sockets.

---

## 3. Adding Custom Language AST Ingestion

AegisCode uses a Go-first AST parser interface to extract declarations and relations into the SQLite CodeGraph:

### Implementing an Extractor
1. Open `server/internal/codegraph/indexer.go`.
2. Implement the `SymbolExtractor` interface for your language:
   ```go
   type SymbolExtractor interface {
       ExtractSymbols(ctx context.Context, path string, content []byte) ([]ExtractedSymbol, []ExtractedEdge, error)
   }
   ```
3. Register your extractor against file extensions:
   ```go
   switch filepath.Ext(path) {
   case ".rs":
       return e.extractRust(ctx, path, content)
   case ".py":
       return e.extractPython(ctx, path, content)
   }
   ```
4. Emitted symbols are automatically indexed into `code_symbols`, registered into `symbol_fts` (FTS5), and rendered on the Cytoscape graph canvas without changing any frontend code.

# Getting Started with AegisCode

Welcome to **AegisCode**! This guide walks you through your first session: opening a project workspace, configuring AI providers, and understanding how AegisCode stores your data.

---

## 1. Opening Your First Workspace

When AegisCode launches, it connects to your active working directory or prompts you to select a workspace.

```text
+--------------------------------------------------------------------------+
|  AegisCode 🛡️    File  Edit  View  Terminal  AI  Help            [ ⚙️ ]  |
+----+-------------------+-----------------------------------+-------------+
| 📁 | EXPLORER          | main.go                           | AI ASSIST   |
| 🔍 | > src             | package main                      |             |
| 🌿 |   > api           |                                   | Prompt:     |
| 🐛 |     api.go        | func main() {                     | "Refactor   |
| 🕸️ |   > store         |     println("Hello AegisCode")    |  handler"   |
| ⚙️ | main.go           | }                                 |             |
+----+-------------------+-----------------------------------+-------------+
| TERMINAL: bash [1]     | PROBLEMS: 0 Errors                | GRAPHS      |
+--------------------------------------------------------------------------+
```

### Methods to Open a Workspace:
1. **Via Command Line**:
   ```bash
   ./bin/aegiscode-darwin-arm64 --workspace /path/to/my-project --open
   ```
2. **Via UI**: Click the **Open Folder** button in the Explorer sidebar or use the top navigation menu (`File -> Open Workspace`).
3. **Workspace Path Security**: AegisCode confirms that the target directory exists and confines all subsequent editor modifications to that root.

---

## 2. Understanding Application Data (`~/.aegis/`)

To prevent repository clutter and avoid creating intrusive `.dotfiles` inside your project repos, AegisCode persists all operational data inside your user home directory:

```text
~/.aegis/
├── aegis.db          # Global SQLite database (WAL mode)
│                     # Contains: app_config, chat_sessions, chat_events, blobs, chat_fts
├── graphs/           # Per-workspace CodeGraph databases
│   ├── a1b2c3d4e5f6.db   # AST symbols, files, and edge relations for Project A
│   └── 9f8e7d6c5b4a.db   # AST symbols, files, and edge relations for Project B
└── ipc/              # Unix domain sockets for local worker supervision
```

### Data Storage Guarantees:
- **Zero-Repo Pollution**: Your Git working tree remains completely clean. No `.aegis/` or `.vscode/` folders are generated inside your code repository.
- **Project Isolation**: Chat sessions and CodeGraph symbol indices are scoped per workspace path hash. Switching projects never leaks context or symbol definitions between repositories.
- **Crash Resilience**: With SQLite Write-Ahead Logging (`WAL`), state is preserved even during unexpected power outages or hard terminations.

---

## 3. Configuring AI Providers

AegisCode features a multi-provider AI studio capable of streaming responses, showing collapsible thinking traces, and executing verified code changes via Review Gates.

Open the **Settings** panel (gear icon `⚙️` in the bottom left or via keyboard shortcut `Cmd+,` / `Ctrl+,`) and select the **AI Engine** tab:

### Supported AI Providers:
1. **Google Gemini**:
   - Enter your `GEMINI_API_KEY`.
   - Supports Gemini 2.0 Flash, Gemini 1.5 Pro, and latest experimental models with fast structured tool calling.
2. **Anthropic Claude**:
   - Enter your `ANTHROPIC_API_KEY`.
   - Supports Claude 3.5 Sonnet and Claude 3.7 Sonnet with native streaming block tokens and extended reasoning.
3. **OpenAI / OpenAI-Compatible Endpoints**:
   - Supports OpenAI (GPT-4o), OpenRouter, Groq, DeepSeek, or local Ollama instances (`http://127.0.0.1:11434/v1`).
   - Configure custom base URL and API keys.
4. **Antigravity CLI (`agy`)**:
   - Deep multi-agent local CLI pair-programming engine.
   - AegisCode automatically detects `agy` in your system `PATH` (`~/.local/bin/agy`) and bridges tool calls out-of-process.

---

## 4. Basic Navigation & Layout

* **Activity Bar (Far Left)**: Toggle views between File Explorer (`📁`), Code Search (`🔍`), Source Control Git (`🌿`), Delve Debugger (`🐛`), CodeGraph Canvas (`🕸️`), and Settings (`⚙️`).
* **Sidebar**: Displays contextual trees (file tree, git status, breakpoint managers, or symbol lists).
* **Editor Stage**: Tabbed CodeMirror 6 workspace with split panes, minimap, syntax highlighting, and inline diagnostics.
* **Integrated Terminal (Bottom)**: Full-featured PTY terminal tabs connected to your default login shell (`bash`, `zsh`, or `pwsh`).
* **AI & CodeGraph Drawer (Right)**: Interactive conversation drawer with collapsible thought chains, tool execution diffs, and the visual Cytoscape graph canvas.

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

## 2. Understanding Application Data (`~/.aegiscode/`)

To prevent repository clutter and avoid creating intrusive `.dotfiles` inside your project repos, AegisCode persists all operational data inside your user home directory (`~/.aegiscode/` per ADR-0002):

```text
~/.aegiscode/
├── aegis.db          # Global SQLite database (WAL mode)
│                     # Contains: app_config, chat_sessions, chat_events, blobs, chat_fts
├── mcp/              # Managed MCP server runtimes & configurations
└── ipc/              # Unix domain sockets for local worker supervision
```

Workspace code intelligence is powered by `@colbymchenry/codegraph` (`.codegraph/codegraph.db`), ensuring lightning-fast SQLite WAL performance without cluttering the global database.

### Data Storage Guarantees:
- **Zero-Repo Pollution**: Your Git working tree remains completely clean. No `.aegis/` or `.vscode/` folders are generated inside your code repository.
- **In-Memory Context Injection**: System instructions are wrapped dynamically in RAM. Your project's `AGENTS.md` is strictly read-only.
- **Project Isolation**: Chat sessions and CodeGraph symbol indices are scoped per workspace path hash. Switching projects never leaks context or symbol definitions between repositories.
- **Crash Resilience**: With SQLite Write-Ahead Logging (`WAL`), state is preserved even during unexpected power outages or hard terminations.

---

## 3. Configuring AI Providers & CodeGraph MCP

AegisCode features a multi-provider AI studio capable of streaming responses, showing collapsible thinking traces, and executing verified code changes via Review Gates.

Open the **Settings** panel (gear icon `⚙️` in the bottom left or via keyboard shortcut `Cmd+,` / `Ctrl+,`) and select the **AI Engine** tab:

### Supported AI Providers:
1. **Google Gemini**:
   - Enter your `GEMINI_API_KEY`.
   - Supports Gemini 2.0 Flash, Gemini 1.5 Pro, and latest experimental models with fast structured tool calling.
2. **Anthropic Claude**:
   - Enter your `ANTHROPIC_API_KEY` (or install local `claude` CLI).
   - Supports Claude 3.5 Sonnet and Claude 3.7 Sonnet with native streaming block tokens and extended reasoning.
3. **OpenAI / OpenAI-Compatible Endpoints**:
   - Supports OpenAI (GPT-4o), OpenRouter, Groq, DeepSeek, or local Ollama instances (`http://127.0.0.1:11434/v1`).
   - Configure custom base URL and API keys.
4. **Antigravity CLI (`agy`)**:
   - Deep multi-agent local CLI pair-programming engine.
   - AegisCode automatically detects `agy` in your system `PATH` (`~/.local/bin/agy`) and bridges tool calls out-of-process.

### How to Configure AI Keys Securely:

AegisCode strictly follows a **Zero-Plaintext-Leakage** policy: your secrets and API keys should never be committed into any repository.

1. **Option A: Environment Variables (Recommended for CLI & CI/CD)**:
   Export your provider keys in your shell profile (`~/.zshrc`, `~/.bashrc`, or launch environment):
   ```bash
   export GEMINI_API_KEY="AIzaSy...[REDACTED]"
   export ANTHROPIC_API_KEY="sk-ant-...[REDACTED]"
   export OPENAI_API_KEY="sk-...[REDACTED]"
   ```
   AegisCode automatically detects and securely binds these environment variables at process startup.

2. **Option B: Settings UI Vault (In-Memory)**:
   - Click the **Settings (`⚙️`)** icon in the bottom-left corner and navigate to the **AI Engine** tab.
   - Enter your API keys directly into the provider input fields.
   - *Security Note*: Keys entered via the UI are kept in memory during your session and stripped from cleartext storage on disk (`aegis.db`) to prevent accidental leaks.

3. **Option C: Companion Pairing Token (LAN Mode)**:
   - When connecting mobile or LAN companion devices, AegisCode dynamically generates an ephemeral 6-character PIN with a 5-minute lockout defense.
   - The token is displayed directly in your terminal at startup:
     ```text
     Companion Pairing: http://<LAN_IP>:<PORT>/?pair=<TOKEN> (TTL: 24h)
     ```
   - For headless or containerized environments, you can optionally override this with your own secret token:
     ```bash
     export AEGIS_PAIRING_TOKEN="<YOUR_CUSTOM_TOKEN>"
     ```

### Automatic MCP Tool Wiring:
Run `npm run mcp:install` in the AegisCode repository. This executes `codegraph install --yes --location=global --init`, registering the 10 CodeGraph intelligence tools across all detected AI agents (Antigravity, Claude Code, Cursor) globally without modifying individual workspace repos.


---

## 4. Basic Navigation & Layout

* **Activity Bar (Far Left)**: Toggle views between File Explorer (`📁`), Code Search (`🔍`), Source Control Git (`🌿`), Delve Debugger (`🐛`), CodeGraph Studio (`🕸️`), and Settings (`⚙️`).
* **Sidebar**: Displays contextual trees (file tree, git status, breakpoint managers, or symbol lists).
* **Editor Stage**: Tabbed CodeMirror 6 workspace with split panes, minimap, syntax highlighting, and inline diagnostics.
* **Integrated Terminal (Bottom)**: Full-featured PTY terminal tabs connected to your default login shell (`bash`, `zsh`, or `pwsh`).
* **AI Drawer (Right)**: Interactive conversation drawer with collapsible thought chains, tool execution diffs, semantic `[MCP]` badges, and instant `[Open]` file navigation.

---

## 5. Master Vault & Security Recovery (Dual-Door Cryptography)

AegisCode includes a built-in cryptographic security gate to protect your code workspace and AI credentials from unauthorized access.

### A. First-Time Setup
When you first start AegisCode, you will be prompted to create a **Master Passphrase** (minimum 6 characters).
1. Enter your chosen Master Passphrase and confirm it.
2. AegisCode will generate an **Emergency Recovery Key** (formatted as `AEGIS-RECV-XXXX-XXXX-XXXX-XXXX`).
3. **Important**: Copy this recovery key and store it in a secure offline location or password manager. AegisCode never stores your plain recovery key or passphrase on the server.

### B. Daily Usage: Locking & Unlocking
* **Unlocking**: Enter your Master Passphrase on the lock screen to decrypt your session and access the workspace.
* **Locking**: You can lock the IDE at any time by clicking the **Lock** icon (`🔒`) in the upper-right header action bar. Locking the IDE flushes decrypted keys from memory.

### C. Intrusion Protection & Safe Recovery
* **Attempt Warnings**: If an incorrect passphrase is typed, AegisCode notifies you of remaining attempts.
* **Temporary Freeze (Soft Deadlock)**: After 5 incorrect attempts, access is paused for 5 minutes.
* **Emergency Quarantine (Panic Shutdown)**: After 10 consecutive failed attempts, AegisCode shuts down the server to protect your data. When restarted, the system enters quarantine mode.
* **Restoring Access**: If you forget your passphrase or trigger quarantine mode, click **"Lupa kata sandi? Gunakan Recovery Key"** on the lock screen. Enter your 24-character Emergency Recovery Key and set a new Master Passphrase to safely regain access.


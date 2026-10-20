# Editor & Integrated Terminal Guide

AegisCode couples a lightweight **CodeMirror 6** editor engine with a high-throughput **PTY Terminal Runner** powered by `@xterm/xterm`.

---

## 1. CodeMirror Editor Capabilities

The editor is engineered for zero input latency, supporting syntax highlighting across Go, TypeScript, JavaScript, Python, HTML/CSS, JSON, and Markdown.

### Essential Keyboard Shortcuts

| Action | macOS Shortcut | Linux / Windows Shortcut |
| :--- | :--- | :--- |
| **Save Active File** | `Cmd + S` | `Ctrl + S` |
| **Find in File** | `Cmd + F` | `Ctrl + F` |
| **Find & Replace** | `Cmd + Option + F` | `Ctrl + H` |
| **Quick Open File** | `Cmd + P` | `Ctrl + P` |
| **Close Active Tab** | `Cmd + W` | `Ctrl + W` |
| **Toggle Terminal** | `Ctrl + \`` | `Ctrl + \`` |
| **Toggle AI Drawer** | `Cmd + J` | `Ctrl + J` |
| **Toggle CodeGraph** | `Cmd + G` | `Ctrl + G` |
| **Duplicate Line Down** | `Shift + Option + Down` | `Shift + Alt + Down` |
| **Comment Line** | `Cmd + /` | `Ctrl + /` |
| **Indent / Outdent** | `Tab` / `Shift + Tab` | `Tab` / `Shift + Tab` |

---

## 2. Buffer Synchronization & Auto-Save

AegisCode uses a non-blocking buffer management pipeline designed to eliminate data loss and prevent edit race conditions:

### Dirty State Indicators
- When you edit a file, an unfilled circle indicator appears on the editor tab and in the Explorer sidebar tree.
- The Git Source Control panel immediately reflects modified status without requiring manual background polling.

### Auto-Save on Blur
- By default, switching editor tabs or clicking outside the active editor triggers an automated background flush (`auto-save on blur`).
- Files are saved directly to disk via atomic REST writes to the Go backend.

### External File Sync (Disk Watcher)
- The Go backend runs an event-driven filesystem watcher.
- When an external tool (e.g. `git checkout`, `go fmt`, or a CLI script) modifies an open file, AegisCode detects the change via SHA-256 hash comparison.
- If the editor buffer is clean, it seamlessly reloads the new content from disk without freezing the UI.

---

## 3. Integrated PTY Terminal Runner

The integrated terminal executes directly against your operating system's native pseudo-terminal subsystem using `creack/pty` in the Go backend.

### Key Features:
* **Multi-Tab Sessions**: Create parallel terminal tabs (`+` button). Switch between different tabs while long-running processes (e.g., dev servers, test runners) continue executing in the background.
* **Full ANSI Color & Escape Support**: Supports 24-bit TrueColor, ANSI color formatting, interactive curses-like prompts, progress bars, and vim/nano sessions.
* **Automatic Viewport Resizing**: Integrated `@xterm/addon-fit` recalculates terminal columns and rows on sash resize and dispatches resize events over WebSockets to the Go PTY runner.
* **Process Isolation**: Terminal shells execute with distinct process group IDs (`setpgid`). Closing a terminal tab or terminating AegisCode automatically sends `SIGTERM` followed by a fail-safe `SIGKILL` to clean up child processes and free ports.

### Managing Terminal Tabs:
```text
[ bash (1) x ]  [ zsh (2) x ]  [ + New Terminal ]           [ 🗑️ Clear ]  [ ✖ Hide ]
-------------------------------------------------------------------------------------
$ go test -v ./...
=== RUN   TestAPISuite
--- PASS: TestAPISuite (0.12s)
PASS
ok      github.com/aditlab-code/AegisCode/server/internal/api   0.154s
$ 
```

- **New Tab**: Click the `+` icon to spawn a new shell.
- **Close Tab**: Click the `x` button on a specific tab to kill the underlying PTY session.
- **Clear Screen**: Use `Cmd + K` (macOS) or type `clear` / `reset`.

---

## 4. Native LaTeX Studio & SyncTeX Workflow

When opening any `.tex` or `.latex` document, AegisCode activates an integrated LaTeX authoring environment:

### Essential LaTeX Shortcuts
| Action | macOS Shortcut | Linux / Windows Shortcut |
| :--- | :--- | :--- |
| **Compile Document** | `Cmd + Option + B` | `Ctrl + Alt + B` |
| **SyncTeX Forward (Jump to PDF)** | `Cmd + Option + J` | `Ctrl + Alt + J` |
| **SyncTeX Inverse (Jump to Source)** | `Cmd + Click` on PDF | `Ctrl + Click` on PDF |

### Workflow Features
- **Integrated LaTeX Toolbar**: Located at the top of the editor pane, allowing you to select compiler recipes (`Auto`, `XeLaTeX`, `pdfLaTeX`, `LuaLaTeX`, `Tectonic`) and trigger compilation or PDF jumps with one click.
- **Side-by-Side Presentation**: Compiling or jumping automatically presents your PDF in split view on the right pane (`group2`) while keeping your cursor focused in the editor on the left (`group1`).
- **Continuous Multi-Page PDF Stream**: Scroll effortlessly through multi-page papers with Adobe Acrobat-style continuous vertical stream and lazy canvas rendering.
- **SyncTeX Pulse Marker**: Forward jump highlights the matching line in the PDF with a momentary animated pulse box. Inverse jump (`Ctrl+Click` on the PDF text) navigates the text cursor straight to the corresponding line in your `.tex` source code.

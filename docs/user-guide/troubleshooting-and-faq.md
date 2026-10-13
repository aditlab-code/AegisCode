# Troubleshooting & Frequently Asked Questions (FAQ)

This guide provides practical solutions for common operational issues, database recovery, and performance tuning in **AegisCode**.

---

## 1. Database Recovery: "Database Locked" or WAL Issues

AegisCode stores data in embedded pure-Go SQLite (`~/.aegis/aegis.db` and `~/.aegis/graphs/*.db`) operating in Write-Ahead Logging (`WAL`) mode. 

If your computer experiences a sudden kernel panic or hard reboot during an active write, SQLite might occasionally report `database is locked` or leave stale shared-memory locks.

### How to Recover:
1. Ensure all AegisCode instances and server processes are stopped:
   ```bash
   # Kill any running aegiscode instances
   pkill -f aegiscode || pkill -f aegis-server
   ```
2. Inspect the `~/.aegis/` folder:
   ```bash
   ls -la ~/.aegis/
   ```
   You may notice three files:
   - `aegis.db` (Primary database)
   - `aegis.db-wal` (Write-ahead log buffer)
   - `aegis.db-shm` (Shared memory index)
3. If SQLite fails to auto-recover on next launch:
   - Safe Checkpoint Command:
     ```bash
     sqlite3 ~/.aegis/aegis.db "PRAGMA wal_checkpoint(TRUNCATE);"
     ```
   - If recovery fails due to corrupted shared memory, removing **only** the `.db-shm` file will force SQLite to regenerate memory indices safely:
     ```bash
     rm ~/.aegis/aegis.db-shm
     ```

---

## 2. Resetting CodeGraph Cache Without Losing Chat History

If you want to force a clean, complete re-indexing of your project's CodeGraph (e.g. after switching major git branches or pulling large structural refactors):

### Safe Per-Project Reset:
Your chat histories, AI thought traces, and global user settings live in `~/.aegis/aegis.db`. The AST CodeGraph indices live separately in `~/.aegis/graphs/`.

To reset only the graph cache:
```bash
# 1. Close AegisCode
# 2. Clear graph caches (does NOT touch chat history)
rm -rf ~/.aegis/graphs/*

# 3. Re-open AegisCode
./bin/aegiscode-darwin-arm64 --open
```
Upon startup, the background AST indexer will automatically rescan your workspace files and reconstruct a fresh, clean graph database in `< 3` seconds.

---

## 3. Resolving Port Conflicts (Ports 8080–8095)

By default, AegisCode attempts to bind to port `8080`. If another service (or a previous crashed test runner) holds that port:

1. **Automatic Port Resolution**: AegisCode automatically probes subsequent ports (`8081`, `8082`, etc.) and notifies you in the terminal.
2. **Explicit Port Cleanup Utility**:
   Run the repository port clearing script:
   ```bash
   npm run clean:ports
   ```
   This locates and terminates lingering processes holding ports `8080`, `8081`, or `5173`.
3. **Specifying a Custom Port**:
   ```bash
   ./bin/aegiscode-darwin-arm64 --port 9000 --open
   ```

---

## 4. Large Codebase Performance (> 50,000 Lines)

### How does AegisCode stay fast on huge codebases?
1. **Fast SHA-256 Bailout**: When files change, AegisCode computes quick SHA-256 hashes before parsing. If file content is identical (e.g. `touch` or metadata changes), AST parsing is completely bypassed.
2. **Ignored Directories**: Large generated folders are automatically ignored during indexing:
   - `.git/`, `.svn/`, `.hg/`
   - `node_modules/`, `dist/`, `build/`
   - `vendor/`, `third_party/`, `.cache/`
3. **Progressive Disclosure Queries**: The CodeGraph and MCP engine never load entire million-line graphs into memory. Queries return focused subgraphs or compact symbol outlines restricted to under 150 tokens.

---

## 5. Frequently Asked Questions (FAQ)

### Q: Why Pure-Go SQLite instead of CGO `go-sqlite3`?
**A**: Compiling with `CGO_ENABLED=0` allows AegisCode to cross-compile into standalone single binaries for macOS, Linux, and Windows from a single machine without requiring external GCC/Clang toolchains or platform-specific C libraries.

### Q: Does AegisCode upload my code to external cloud servers?
**A**: **No.** AegisCode runs 100% locally on your machine. Your code files, Git metadata, and CodeGraph databases never leave your computer. The only external network requests occur when you explicitly prompt an external AI provider (such as Anthropic Claude or OpenAI), sending only the immediate prompt context and selected diffs.

### Q: Can I run AegisCode headless on a remote server?
**A**: Yes. Run `./bin/aegiscode-linux-amd64 --port 8080 --no-open` on your remote server and connect via SSH port forwarding (`ssh -L 8080:127.0.0.1:8080 user@remote`).

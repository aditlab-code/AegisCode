# Contributing to AegisCode

Thank you for your interest in contributing to **AegisCode**! We welcome contributions from developers of all backgrounds.

Please review this guide before submitting issues or pull requests to keep development fast, consistent, and maintainable.

---

## 1. Prime Directives & Engineering Principles

AegisCode is built under clear architectural constraints:
1. **Zero Over-Engineering**: Keep code lean, pragmatic, and direct. Avoid unnecessary abstraction layers, deep inheritance, or speculative features.
2. **Strict Zero-CGO (`CGO_ENABLED=0`)**: The Go backend must compile cleanly without external C compilers to preserve instant cross-compilation across macOS, Linux, and Windows.
3. **No Catching Errors Silently**: Never leave empty catch blocks or ignore returned errors. Report failures explicitly.
4. **Tailwind Semantic Tokens**: Never use hardcoded hex color codes in frontend components. Always reuse semantic CSS variables from `src/styles/tokens.css` via Tailwind CSS v4 (`bg-canvas`, `bg-surface`, `text-ink`, `border-line`, etc.).
5. **No Local Machine Paths**: Never commit absolute local filesystem paths (e.g. `/Users/...` or `C:\...`). Always use relative repository links or standard application data paths (`~/.aegis/`).

---

## 2. Development Environment Setup

### Prerequisites
- **Go**: Version `1.23` or newer ([golang.org](https://golang.org))
- **Node.js**: Version `20.x` or newer ([nodejs.org](https://nodejs.org))
- **Package Manager**: `npm` or `pnpm`
- **Git**: Version `2.30+`

### Repository Setup
```bash
# Clone the repository
git clone https://github.com/aditlab-code/AegisCode.git
cd AegisCode

# Install frontend dependencies
npm install

# Verify backend compilation (Zero-CGO)
CGO_ENABLED=0 go -C server build ./cmd/server
```

### Running the Local Development Stack
You can start the frontend Vite dev server and the backend Go server simultaneously:

```bash
# Terminal 1: Run Vite frontend (default: http://localhost:5173)
npm run dev

# Terminal 2: Run Go core backend (default: http://127.0.0.1:8080)
npm run server
```

Or run the combined dev launcher:
```bash
npm run dev:all
```

---

## 3. Building & Packaging

### Standalone Production Binary
To produce a single, self-contained executable that embeds the frontend single-page application:

```bash
# Build frontend production bundle
npm run build

# Compile embedded single binary for current host platform
npm run build:binary
```

The resulting executable will be placed in `./bin/`.

### Cross-Compilation Targets
To build binaries for all supported platforms (macOS Apple Silicon/Intel, Linux amd64/arm64, Windows amd64):

```bash
npm run build:binary:all
```

---

## 4. Coding & Commit Standards

### Branch Naming
- `feat/<short-description>`: New features or capabilities
- `fix/<short-description>`: Bug fixes
- `docs/<short-description>`: Documentation additions or updates
- `refactor/<short-description>`: Code restructuring without functional changes

### Conventional Commits
All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```text
<type>(<optional scope>): <short summary in imperative mood>

[optional body]

[optional footer(s)]
```

**Allowed Types**:
- `feat`: New feature or user-visible enhancement
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or correcting tests
- `chore`: Tooling, configuration, or build system updates

*Important*: Do not include automated agent signatures, tool brandings, or "Co-authored-by" attribution trailers in commit messages.

---

## 5. Pre-Submission Verification Checklist

Before creating a Pull Request, you **must** run and pass the following verification gates locally:

```bash
# 1. Frontend production build (must exit with 0 errors)
npm run build

# 2. Code formatting check (via oxfmt)
npm run format

# 3. Frontend unit tests
npm run test:frontend

# 4. Backend tests (Zero-CGO)
npm run test:backend
```

Ensure that:
- [ ] No local machine paths (e.g. `/Users/...`) are introduced.
- [ ] `CGO_ENABLED=0` remains functional for the Go backend.
- [ ] No unnecessary dependencies or large uncompressed assets were added.
- [ ] Relevant documentation has been updated to reflect changes.

---

## 6. Pull Request Process

1. Fork the repository and create your feature branch from `main`.
2. Commit your changes adhering to Conventional Commits.
3. Push to your fork and submit a Pull Request to `main`.
4. Fill out the Pull Request template completely, checking off all verification items.
5. Address any feedback from project maintainers. Once approved, commits will be squashed and merged.

## Description
<!-- Provide a clear, concise summary of the changes introduced in this PR. -->

## Related Issue(s)
<!-- Fixes #(issue) or Closes #(issue) -->

## Type of Change
- [ ] 🐛 Bug fix (non-breaking change fixing an issue)
- [ ] ✨ New feature (non-breaking change adding functionality)
- [ ] ♻️ Code refactoring (no functional changes)
- [ ] 📚 Documentation update
- [ ] 🛠️ Tooling, packaging, or CI/CD change

---

## 🛡️ Contributor Quality Checklist

Please ensure all items are completed before submitting your Pull Request:

- [ ] **Zero-CGO Preserved**: The Go backend compiles cleanly with `CGO_ENABLED=0 go build ./cmd/server`.
- [ ] **Frontend Build**: Verified with `npm run build` (must exit with 0 errors).
- [ ] **Code Formatting**: Verified with `npm run format` (`oxfmt`).
- [ ] **Tests Pass**: Both `npm run test:frontend` and `npm run test:backend` pass.
- [ ] **No Local Path Leaks**: Verified that no machine-specific paths (e.g. `/Users/...`, `C:\...`, or `file:///...`) are introduced.
- [ ] **Tailwind Tokens**: Any new UI components use semantic CSS tokens (`bg-canvas`, `bg-surface`, `text-ink`, `border-line`) rather than hardcoded hex colors.
- [ ] **Error Handling**: Functions return explicit errors; no silent empty catch blocks.
- [ ] **Documentation**: Corresponding user guides or API references have been updated.
- [ ] **Conventional Commits**: Commit messages follow `feat:`, `fix:`, `docs:`, etc., without automated tool branding or author trailer signatures.

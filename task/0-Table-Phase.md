# Table Phase: Smooth AI Typing, Mermaid Rendering & Fullscreen Preview Modal

> **Dokumen Rencana Wave & Micro-Phase**  
> Dibuat oleh Kanna sesuai `#WORKFLOW` pada `task/0-0-Orchestrator.md`.  
> Status Global: `COMPLETED`

---

## Detailed Micro-Phases

| Phase ID | Name / Description | Target File(s) | Dependencies | Verification Gate | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MP-TYP1** | Adaptive Smooth Typewriter Hook & Realtime Markdown | `src/components/layout/chat/useSmoothStream.ts`, `MarkdownRenderer.tsx` | None | Initial build passed | `PASSED` |
| **MP-MER1** | Mermaid On-Demand Lazy Block | `package.json`, `src/components/layout/chat/MermaidBlock.tsx` | None | Initial build passed | `PASSED` |
| **MP-MER2** | CodeBlockView Integration | `src/components/layout/chat/MarkdownRenderer.tsx` | MP-MER1 | Initial build passed | `PASSED` |
| **MP-FIX-CHAT** | Anti-Freeze Chat Stream & Fast-Path Tokenization | `src/components/layout/chat/MarkdownRenderer.tsx`, `useSmoothStream.ts` | None | Initial build passed | `PASSED` |
| **MP-FIX-MERMAID** | Strict Mermaid Streaming Guard & DOM Cleanup | `src/components/layout/chat/MermaidBlock.tsx` | None | Initial build passed | `PASSED` |
| **MP-MOD1** | **Mermaid Global Lightbox Modal**: Buat `MermaidPreviewModal.tsx` menggunakan React Portal, Pan & Zoom canvas (mouse drag, wheel scroll), toolbar controls (zoom in/out, fit, download SVG, copy, close via Esc). | `src/components/layout/chat/MermaidPreviewModal.tsx` | None | `npm run build` | `PASSED` |
| **MP-MOD2** | **Trigger Integration**: Tambahkan tombol Preview (`<Icon name="maximize" />`) pada toolbar `MermaidBlock.tsx` untuk membuka modal. | `src/components/layout/chat/MermaidBlock.tsx` | MP-MOD1 | `npm run build` | `PASSED` |
| **MP-MOD-VER** | **Final Verification Gates**: Full compile, oxfmt format check, dan vitest test suite. | Workspace | MP-MOD1, MP-MOD2 | 0 errors | `PASSED` |
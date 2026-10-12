import type {
  AppSettings,
  EditorSettings,
  WorkbenchAppearanceSettings,
  FeaturesSettings,
  CompanionSettings,
  FilesSettings,
  AgentSettings,
  ChatProvider,
  ThemePaletteId,
  ThemeMode,
} from "../../../types/workbench"
import {
  CHAT_PROVIDERS,
  getMergedProviderModels,
} from "../../../data/chatConstants"
import { testProviderConnection } from "../../../utils/storeApi"

export interface SettingItem {
  id: string
  category: "Editor" | "Files" | "Workbench" | "Window" | "Features" | "Companion" | "AI" | "LSP"
  title: string
  description: string
  type: "boolean" | "select" | "text" | "number" | "password" | "custom-models" | "provider-test" | "info"
  value?: boolean | string | number
  options?: string[]
  onChange?: (val: any) => void
  isFutureNotice?: boolean
  futureNoticeText?: string
  customModels?: string[]
  onAddCustomModel?: (modelId: string) => void
  onRemoveCustomModel?: (modelId: string) => void
  providerId?: string
  onTestConnection?: () => Promise<{
    success: boolean
    latencyMs?: number
    message?: string
    error?: string
  }>
}

export interface SettingsRegistryCallbacks {
  settings?: AppSettings
  updateEditorSettings: (
    patch: Partial<EditorSettings> | ((prev: EditorSettings) => EditorSettings),
  ) => void
  updateWorkbenchSettings: (
    patch: Partial<{
      appearance: WorkbenchAppearanceSettings
      sidebarPosition: "left" | "right"
      compactFolders: boolean
    }> | ((prev: {
      appearance: WorkbenchAppearanceSettings
      sidebarPosition: "left" | "right"
      compactFolders: boolean
    }) => {
      appearance: WorkbenchAppearanceSettings
      sidebarPosition: "left" | "right"
      compactFolders: boolean
    }),
  ) => void
  updateFilesSettings: (
    patch: Partial<FilesSettings> | ((prev: FilesSettings) => FilesSettings),
  ) => void
  updateFeaturesSettings: (
    patch: Partial<FeaturesSettings> | ((
      prev: FeaturesSettings,
    ) => FeaturesSettings),
  ) => void
  updateCompanionSettings: (
    patch: Partial<CompanionSettings> | ((
      prev: CompanionSettings,
    ) => CompanionSettings),
  ) => void
  updateAgentSettings?: (
    patch: Partial<AgentSettings> | ((prev: AgentSettings) => AgentSettings),
  ) => void
  setThemePalette: (palette: ThemePaletteId) => void
  setThemeMode: (mode: ThemeMode) => void
  showToast: (msg: string) => void
}

export function buildSettingsSchema(
  callbacks: SettingsRegistryCallbacks,
): SettingItem[] {
  const {
    settings,
    updateEditorSettings,
    updateWorkbenchSettings,
    updateFilesSettings,
    updateFeaturesSettings,
    updateCompanionSettings,
    updateAgentSettings,
    setThemePalette,
    setThemeMode,
    showToast,
  } = callbacks

  return [
    // 1. Text Editor
    {
      id: "editor.accessibilityPageSize",
      category: "Editor",
      title: "Editor: Accessibility Page Size",
      description:
        "Controls the number of lines read out at once by a screen reader and chunks DOM virtual scroll buffers (default: 500 lines).",
      type: "number",
      value: settings?.editor?.accessibilityPageSize ?? 500,
      onChange: (v) => {
        updateEditorSettings({ accessibilityPageSize: Number(v) || 500 })
        showToast(`Accessibility page size set to ${v}`)
      },
    },
    {
      id: "editor.fontSize",
      category: "Editor",
      title: "Editor: Font Size",
      description:
        "Controls the font size in pixels across all editor code panes and line numbers.",
      type: "number",
      value: settings?.editor?.fontSize ?? 13.5,
      onChange: (v) => {
        updateEditorSettings({ fontSize: Number(v) || 13.5 })
        showToast(`Editor font size set to ${v}px`)
      },
    },
    {
      id: "editor.fontFamily",
      category: "Editor",
      title: "Editor: Font Family",
      description:
        "Controls the font family used across all editor code panes.",
      type: "text",
      value:
        settings?.editor?.fontFamily ?? "SFMono-Regular, Consolas, monospace",
      onChange: (v) => {
        updateEditorSettings({ fontFamily: v })
      },
    },
    {
      id: "editor.lineHeight",
      category: "Editor",
      title: "Editor: Line Height",
      description:
        "Controls the line height in pixels across editor line numbers, syntax tokens, and interactive caret overlay.",
      type: "number",
      value: settings?.editor?.lineHeight ?? 22,
      onChange: (v) => {
        updateEditorSettings({ lineHeight: Number(v) || 22 })
        showToast(`Editor line height set to ${v}px`)
      },
    },
    {
      id: "editor.wordWrap",
      category: "Editor",
      title: "Editor: Word Wrap",
      description:
        "Controls how lines should wrap in the code editor viewport (off, on, wordWrapColumn).",
      type: "select",
      value: settings?.editor?.wordWrap ?? "off",
      options: ["off", "on", "wordWrapColumn"],
      onChange: (v) => {
        updateEditorSettings({ wordWrap: v })
        showToast(`Word wrap set to ${v}`)
      },
    },
    {
      id: "editor.wordWrapColumn",
      category: "Editor",
      title: "Editor: Word Wrap Column",
      description:
        "Controls the wrapping column of the editor when Word Wrap is set to wordWrapColumn.",
      type: "number",
      value: settings?.editor?.wordWrapColumn ?? 80,
      onChange: (v) => {
        updateEditorSettings({ wordWrapColumn: Number(v) || 80 })
      },
    },
    {
      id: "editor.minimap.enabled",
      category: "Editor",
      title: "Editor: Minimap Enabled",
      description: "Controls whether the minimap code preview is shown.",
      type: "boolean",
      value: settings?.editor?.minimapEnabled ?? true,
      onChange: (v) => {
        updateEditorSettings({ minimapEnabled: Boolean(v) })
        showToast(`Minimap ${v ? "enabled" : "disabled"}`)
      },
    },
    {
      id: "editor.minimap.scale",
      category: "Editor",
      title: "Editor: Minimap Scale",
      description:
        "Controls the text font size and outline scaling of the minimap preview.",
      type: "select",
      value: settings?.editor?.minimapScale ?? "medium",
      options: ["small", "medium", "large"],
      onChange: (v) => {
        updateEditorSettings({ minimapScale: v })
        showToast(`Minimap scale set to ${v}`)
      },
    },
    {
      id: "editor.minimap.side",
      category: "Editor",
      title: "Editor: Minimap Side",
      description:
        "Controls the side where the minimap is rendered (right or left).",
      type: "select",
      value: settings?.editor?.minimapSide ?? "right",
      options: ["right", "left"],
      onChange: (v) => {
        updateEditorSettings({ minimapSide: v })
        showToast(`Minimap side set to ${v}`)
      },
    },
    {
      id: "editor.diffEditor.renderSideBySide",
      category: "Editor",
      title: "Diff Editor: Side-by-Side View",
      description:
        "Controls whether the diff editor shows side-by-side split or unified single-pane comparison.",
      type: "boolean",
      value: settings?.editor?.diffEditor?.renderSideBySide ?? true,
      onChange: (v) => {
        updateEditorSettings((prev) => ({
          ...prev,
          diffEditor: { ...prev.diffEditor, renderSideBySide: Boolean(v) },
        }))
        showToast(`Diff view set to ${v ? "Side-by-Side" : "Unified"}`)
      },
    },
    {
      id: "editor.diffEditor.inheritEditorFont",
      category: "Editor",
      title: "Diff Editor: Inherit Text Editor Typography",
      description:
        "When enabled, diff editor automatically uses font family, font size, line height, and word wrap from Text Editor.",
      type: "boolean",
      value: settings?.editor?.diffEditor?.inheritEditorFont ?? true,
      onChange: (v) => {
        updateEditorSettings((prev) => ({
          ...prev,
          diffEditor: { ...prev.diffEditor, inheritEditorFont: Boolean(v) },
        }))
        showToast(`Diff typography inheritance ${v ? "enabled" : "disabled"}`)
      },
    },
    {
      id: "editor.tabSize",
      category: "Editor",
      title: "Editor: Tab Size",
      description:
        "The number of spaces a tab is equal to across code panes and indent calculations.",
      type: "select",
      value: String(settings?.editor?.tabSize ?? 2),
      options: ["2", "4", "8"],
      onChange: (v) => {
        updateEditorSettings({ tabSize: Number(v) || 2 })
        showToast(`Tab size set to ${v}`)
      },
    },
    {
      id: "editor.insertSpaces",
      category: "Editor",
      title: "Editor: Insert Spaces",
      description:
        "Insert spaces when pressing Tab instead of a tab character.",
      type: "boolean",
      value: settings?.editor?.insertSpaces ?? true,
      onChange: (v) => {
        updateEditorSettings({ insertSpaces: Boolean(v) })
        showToast(`Insert spaces ${v ? "enabled" : "disabled"}`)
      },
    },
    {
      id: "editor.cursorBlinking",
      category: "Editor",
      title: "Editor: Cursor Blinking",
      description:
        "Controls the cursor animation style in code editors (smooth, blink, or solid).",
      type: "select",
      value: settings?.editor?.cursorBlinking ?? "smooth",
      options: ["smooth", "blink", "solid"],
      onChange: (v) => {
        updateEditorSettings({ cursorBlinking: v as any })
        showToast(`Cursor blinking set to ${v}`)
      },
    },
    {
      id: "editor.renderWhitespace",
      category: "Editor",
      title: "Editor: Render Whitespace",
      description:
        "Controls how whitespace characters are rendered in the editor (none, selection, or all).",
      type: "select",
      value: settings?.editor?.renderWhitespace ?? "selection",
      options: ["none", "selection", "all"],
      onChange: (v) => {
        updateEditorSettings({ renderWhitespace: v as any })
        showToast(`Render whitespace set to ${v}`)
      },
    },
    {
      id: "editor.formatOnSave",
      category: "Editor",
      title: "Editor: Format On Save",
      description: "Automatically format file buffer upon saving.",
      type: "boolean",
      value: settings?.editor?.formatOnSave ?? true,
      onChange: (v) => {
        updateEditorSettings({ formatOnSave: Boolean(v) })
        showToast(`Format on save ${v ? "enabled" : "disabled"}`)
      },
    },

    // 2. Files
    {
      id: "files.autoSave",
      category: "Files",
      title: "Files: Auto Save",
      description:
        "Controls auto save of dirty editors. afterDelay saves after delay, onFocusChange saves when focus changes, off requires manual save.",
      type: "select",
      value: settings?.files?.autoSave ?? "afterDelay",
      options: ["afterDelay", "onFocusChange", "off"],
      onChange: (v) => {
        updateFilesSettings({ autoSave: v as any })
        showToast(`Auto save set to ${v}`)
      },
    },
    {
      id: "files.autoSaveDelay",
      category: "Files",
      title: "Files: Auto Save Delay",
      description:
        "Controls the delay in milliseconds after which a dirty editor is automatically saved when autoSave is set to afterDelay.",
      type: "number",
      value: settings?.files?.autoSaveDelay ?? 1000,
      onChange: (v) => {
        updateFilesSettings({ autoSaveDelay: Number(v) || 1000 })
        showToast(`Auto save delay set to ${v}ms`)
      },
    },
    {
      id: "files.trimTrailingWhitespace",
      category: "Files",
      title: "Files: Trim Trailing Whitespace",
      description:
        "When enabled, automatically trims trailing whitespace on all lines when saving a file.",
      type: "boolean",
      value: settings?.files?.trimTrailingWhitespace ?? true,
      onChange: (v) => {
        updateFilesSettings({ trimTrailingWhitespace: Boolean(v) })
        showToast(`Trim trailing whitespace ${v ? "enabled" : "disabled"}`)
      },
    },
    {
      id: "files.insertFinalNewline",
      category: "Files",
      title: "Files: Insert Final Newline",
      description:
        "When enabled, ensures files end with a final newline character upon saving.",
      type: "boolean",
      value: settings?.files?.insertFinalNewline ?? true,
      onChange: (v) => {
        updateFilesSettings({ insertFinalNewline: Boolean(v) })
        showToast(`Insert final newline ${v ? "enabled" : "disabled"}`)
      },
    },
    {
      id: "files.eol",
      category: "Files",
      title: "Files: End of Line (EOL)",
      description:
        "Default end of line character sequence (\\n for LF, \\r\\n for CRLF).",
      type: "select",
      value: settings?.files?.eol === "\r\n" ? "CRLF (\\r\\n)" : "LF (\\n)",
      options: ["LF (\\n)", "CRLF (\\r\\n)"],
      onChange: (v) => {
        const val = v.startsWith("CRLF") ? "\r\n" : "\n"
        updateFilesSettings({ eol: val })
        showToast(`Line ending set to ${v}`)
      },
    },
    {
      id: "files.exclude",
      category: "Files",
      title: "Files: Exclude Patterns",
      description:
        "Glob patterns to exclude from explorer and search (comma-separated).",
      type: "text",
      value: (settings?.files?.exclude ?? []).join(", "),
      onChange: (v) => {
        const list = String(v)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        updateFilesSettings({ exclude: list })
      },
    },

    // 3. Workbench
    {
      id: "workbench.appearance.palette",
      category: "Workbench",
      title: "Workbench: Theme Palette",
      description:
        "Select the active color theme palette (Default Aegis, Atom One, or Tokyo Night). Palettes are loaded from modular JSON files.",
      type: "select",
      value: settings?.workbench?.appearance?.palette ?? "default",
      options: ["default", "atom", "tokyo-night"],
      onChange: (v) => {
        setThemePalette(v)
        showToast(`Theme palette changed to ${v}`)
      },
    },
    {
      id: "workbench.appearance.mode",
      category: "Workbench",
      title: "Workbench: Color Mode",
      description:
        "Controls the active color mode (Dark or Light) for the entire workspace.",
      type: "select",
      value: settings?.workbench?.appearance?.mode ?? "dark",
      options: ["dark", "light"],
      onChange: (v) => {
        setThemeMode(v)
        showToast(`Color mode set to ${v}`)
      },
    },
    {
      id: "workbench.appearance.fontSize",
      category: "Workbench",
      title: "Workbench: UI Font Size",
      description:
        "Controls the base typography font size in pixels across headers, sidebars, and dialogs.",
      type: "number",
      value: settings?.workbench?.appearance?.fontSize ?? 12,
      onChange: (v) => {
        updateWorkbenchSettings({ fontSize: Number(v) || 12 })
        showToast(`Workbench font size set to ${v}px`)
      },
    },
    {
      id: "workbench.appearance.fontFamily",
      category: "Workbench",
      title: "Workbench: UI Font Family",
      description:
        "Controls the primary UI sans-serif font family used across the workbench shell.",
      type: "text",
      value:
        settings?.workbench?.appearance?.fontFamily ??
        "Inter, system-ui, sans-serif",
      onChange: (v) => {
        updateWorkbenchSettings({ fontFamily: v })
      },
    },
    {
      id: "workbench.appearance.lineHeight",
      category: "Workbench",
      title: "Workbench: UI Line Height",
      description:
        "Controls the UI typography line height multiplier across the workbench interface.",
      type: "number",
      value: settings?.workbench?.appearance?.lineHeight ?? 1.4,
      onChange: (v) => {
        updateWorkbenchSettings({ lineHeight: Number(v) || 1.4 })
      },
    },
    {
      id: "workbench.sidebarPosition",
      category: "Workbench",
      title: "Workbench: Sidebar Position",
      description:
        "Controls the position of the primary sidebar and activity rail (left or right).",
      type: "select",
      value: settings?.workbench?.sidebarPosition ?? "left",
      options: ["left", "right"],
      onChange: (v) => {
        updateWorkbenchSettings({ sidebarPosition: v as any })
        showToast(`Sidebar position set to ${v}`)
      },
    },
    {
      id: "workbench.compactFolders",
      category: "Workbench",
      title: "Workbench: Compact Folders",
      description:
        "Controls whether the file explorer renders single-child folder chains in a compact line.",
      type: "boolean",
      value: settings?.workbench?.compactFolders ?? true,
      onChange: (v) => {
        updateWorkbenchSettings({ compactFolders: Boolean(v) })
        showToast(`Compact folders ${v ? "enabled" : "disabled"}`)
      },
    },
    {
      id: "workbench.browser",
      category: "Workbench",
      title: "Workbench: Embedded Browser Companion",
      description:
        "Integrated in-editor web browser pane with live dev-server reloading, responsive viewport simulation, and DOM inspector.",
      type: "info",
      isFutureNotice: true,
      futureNoticeText: "Companion Browser Preview",
    },

    // 4. Window
    {
      id: "window.profiles",
      category: "Window",
      title: "Window: Workspace Profiles",
      description:
        "Switch between personalized workspace configurations (e.g., Frontend React, Backend Go/Rust, Minimalist Zen, Tablet Companion) with cloud synchronization.",
      type: "info",
      isFutureNotice: true,
      futureNoticeText: "Profile Sync & Switcher",
    },

    // 5. Features
    {
      id: "features.terminal.sse",
      category: "Features",
      title: "Terminal: SSE Streaming Protocol",
      description:
        "Connects terminal sessions over Server-Sent Events (SSE) with live bi-directional streaming and ANSI color decoding.",
      type: "boolean",
      value: settings?.features?.terminal?.sseEnabled ?? true,
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          terminal: { ...prev.terminal, sseEnabled: Boolean(v) },
        }))
        showToast(`Terminal SSE streaming ${v ? "enabled" : "disabled"}`)
      },
      isFutureNotice: true,
    },
    {
      id: "features.terminal.shortcut",
      category: "Features",
      title: "Terminal: Toggle Shortcut",
      description:
        "Keyboard shortcut to toggle bottom terminal session panel (default: Ctrl+`).",
      type: "text",
      value: settings?.features?.terminal?.shortcut ?? "Ctrl+`",
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          terminal: { ...prev.terminal, shortcut: v },
        }))
      },
      isFutureNotice: true,
    },
    {
      id: "features.terminal.cursorStyle",
      category: "Features",
      title: "Terminal: Cursor Style",
      description:
        "Controls the rendering style of the interactive terminal cursor (block, line, underline).",
      type: "select",
      value: settings?.features?.terminal?.cursorStyle ?? "block",
      options: ["block", "line", "underline"],
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          terminal: { ...prev.terminal, cursorStyle: v },
        }))
      },
      isFutureNotice: true,
    },
    {
      id: "features.terminal.cursorBlinking",
      category: "Features",
      title: "Terminal: Cursor Blinking",
      description: "Controls whether the terminal cursor blinks in focus.",
      type: "boolean",
      value: settings?.features?.terminal?.cursorBlinking ?? true,
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          terminal: { ...prev.terminal, cursorBlinking: Boolean(v) },
        }))
      },
      isFutureNotice: true,
    },
    {
      id: "features.terminal.fontSize",
      category: "Features",
      title: "Terminal: Font Size",
      description: "Controls the terminal character font size in pixels.",
      type: "number",
      value: settings?.features?.terminal?.fontSize ?? 12,
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          terminal: { ...prev.terminal, fontSize: Number(v) || 12 },
        }))
      },
      isFutureNotice: true,
    },
    {
      id: "features.terminal.fontFamily",
      category: "Features",
      title: "Terminal: Font Family",
      description:
        "Controls the monospace font family used across terminal sessions.",
      type: "text",
      value:
        settings?.features?.terminal?.fontFamily ??
        "SFMono-Regular, Menlo, monospace",
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          terminal: { ...prev.terminal, fontFamily: v },
        }))
      },
      isFutureNotice: true,
    },
    {
      id: "features.terminal.lineHeight",
      category: "Features",
      title: "Terminal: Line Height",
      description:
        "Controls the line height multiplier for integrated terminal session output.",
      type: "number",
      value: settings?.features?.terminal?.lineHeight ?? 1.4,
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          terminal: { ...prev.terminal, lineHeight: Number(v) || 1.4 },
        }))
      },
      isFutureNotice: true,
    },
    {
      id: "features.sourceControl.maxVisibleChanges",
      category: "Features",
      title: "Source Control: Max Visible Changes",
      description:
        "Maximum number of staged and working tree changes visible before collapsing into 'Show All' pagination (default: 50).",
      type: "number",
      value: settings?.features?.sourceControl?.maxVisibleChanges ?? 50,
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          sourceControl: {
            ...prev.sourceControl,
            maxVisibleChanges: Number(v) || 50,
          },
        }))
        showToast(`Max visible changes set to ${v}`)
      },
    },
    {
      id: "features.sourceControl.graphPageSize",
      category: "Features",
      title: "Source Control: Graph Page Size",
      description:
        "Number of commit nodes rendered per page in the visual SVG commit tree graph (default: 25).",
      type: "number",
      value: settings?.features?.sourceControl?.graphPageSize ?? 25,
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          sourceControl: {
            ...prev.sourceControl,
            graphPageSize: Number(v) || 25,
          },
        }))
        showToast(`Graph page size set to ${v}`)
      },
    },
    {
      id: "features.timeline.maxVisibleItems",
      category: "Features",
      title: "Timeline: Max Visible Commits",
      description:
        "Maximum history commits fetched and rendered in the Explorer Timeline panel (default: 30).",
      type: "number",
      value: settings?.features?.timeline?.maxVisibleItems ?? 30,
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          timeline: {
            ...prev.timeline,
            maxVisibleItems: Number(v) || 30,
          },
        }))
        showToast(`Timeline max items set to ${v}`)
      },
    },
    {
      id: "features.comments.enableTodoHighlight",
      category: "Features",
      title: "Comments: Highlight TODO / FIXME Tags",
      description:
        "Controls syntax highlighting badges for TODO, FIXME, NOTE, BUG, and HACK comment tags in editor code.",
      type: "boolean",
      value: settings?.features?.comments?.enableTodoHighlight ?? true,
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          comments: {
            ...prev.comments,
            enableTodoHighlight: Boolean(v),
          },
        }))
        showToast(`TODO tag highlighting ${v ? "enabled" : "disabled"}`)
      },
    },
    {
      id: "features.comments.todoKeywords",
      category: "Features",
      title: "Comments: Tag Keywords",
      description:
        "Comma-separated tag keywords recognized for prominent badge highlighting.",
      type: "text",
      value:
        settings?.features?.comments?.todoKeywords ??
        "TODO, FIXME, NOTE, BUG, HACK",
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          comments: { ...prev.comments, todoKeywords: v },
        }))
      },
    },
    {
      id: "features.lsp.formatOnSave",
      category: "LSP",
      title: "LSP: Format on Save",
      description:
        "Automatically format documents with the active language server when pressing Cmd+S / Ctrl+S.",
      type: "boolean",
      value: settings?.features?.lsp?.formatOnSave ?? true,
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          lsp: {
            ...prev.lsp,
            formatOnSave: Boolean(v),
            servers: prev.lsp?.servers || {},
          },
        }))
        showToast(`Format on save ${v ? "enabled" : "disabled"}`)
      },
    },
    {
      id: "features.lsp.servers.typescript",
      category: "LSP",
      title: "LSP: TypeScript/JavaScript Binary Path",
      description:
        "Custom path to vtsls or typescript-language-server executable.",
      type: "text",
      value: settings?.features?.lsp?.servers?.typescript ?? "",
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          lsp: {
            ...prev.lsp,
            servers: {
              ...(prev.lsp?.servers || {}),
              typescript: String(v).trim(),
            },
          },
        }))
      },
    },
    {
      id: "features.lsp.servers.python",
      category: "LSP",
      title: "LSP: Python Binary Path",
      description: "Custom path to pyright-langserver or ruff executable.",
      type: "text",
      value: settings?.features?.lsp?.servers?.python ?? "",
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          lsp: {
            ...prev.lsp,
            servers: {
              ...(prev.lsp?.servers || {}),
              python: String(v).trim(),
            },
          },
        }))
      },
    },
    {
      id: "features.lsp.servers.go",
      category: "LSP",
      title: "LSP: Go Binary Path",
      description: "Custom path to gopls executable.",
      type: "text",
      value: settings?.features?.lsp?.servers?.go ?? "",
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          lsp: {
            ...prev.lsp,
            servers: {
              ...(prev.lsp?.servers || {}),
              go: String(v).trim(),
            },
          },
        }))
      },
    },
    {
      id: "features.lsp.servers.rust",
      category: "LSP",
      title: "LSP: Rust Binary Path",
      description: "Custom path to rust-analyzer executable.",
      type: "text",
      value: settings?.features?.lsp?.servers?.rust ?? "",
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          lsp: {
            ...prev.lsp,
            servers: {
              ...(prev.lsp?.servers || {}),
              rust: String(v).trim(),
            },
          },
        }))
      },
    },
    {
      id: "features.lsp.servers.cpp",
      category: "LSP",
      title: "LSP: C/C++ Binary Path",
      description: "Custom path to clangd executable.",
      type: "text",
      value: settings?.features?.lsp?.servers?.cpp ?? "",
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          lsp: {
            ...prev.lsp,
            servers: {
              ...(prev.lsp?.servers || {}),
              cpp: String(v).trim(),
            },
          },
        }))
      },
    },
    {
      id: "features.lsp.servers.html",
      category: "LSP",
      title: "LSP: HTML Binary Path",
      description: "Custom path to vscode-html-language-server executable.",
      type: "text",
      value: settings?.features?.lsp?.servers?.html ?? "",
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          lsp: {
            ...prev.lsp,
            servers: {
              ...(prev.lsp?.servers || {}),
              html: String(v).trim(),
            },
          },
        }))
      },
    },
    {
      id: "features.lsp.servers.css",
      category: "LSP",
      title: "LSP: CSS Binary Path",
      description: "Custom path to vscode-css-language-server executable.",
      type: "text",
      value: settings?.features?.lsp?.servers?.css ?? "",
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          lsp: {
            ...prev.lsp,
            servers: {
              ...(prev.lsp?.servers || {}),
              css: String(v).trim(),
            },
          },
        }))
      },
    },
    {
      id: "features.lsp.servers.json",
      category: "LSP",
      title: "LSP: JSON Binary Path",
      description: "Custom path to vscode-json-language-server executable.",
      type: "text",
      value: settings?.features?.lsp?.servers?.json ?? "",
      onChange: (v) => {
        updateFeaturesSettings((prev) => ({
          ...prev,
          lsp: {
            ...prev.lsp,
            servers: {
              ...(prev.lsp?.servers || {}),
              json: String(v).trim(),
            },
          },
        }))
      },
    },

    // 6. Companion (Remote Tablet)
    {
      id: "companion.port",
      category: "Companion",
      title: "Companion: Server Pairing Port",
      description:
        "Local HTTP/WebSocket port for tablet companion pairing and remote editing (default: 8080).",
      type: "number",
      value: settings?.companion?.port ?? 8080,
      onChange: (v) => {
        updateCompanionSettings({ port: Number(v) || 8080 })
        showToast(`Companion pairing port set to ${v}`)
      },
      isFutureNotice: true,
    },
    {
      id: "companion.mdnsDiscovery",
      category: "Companion",
      title: "Companion: mDNS Auto-Discovery",
      description:
        "Broadcast local zero-config mDNS beacon for automatic tablet companion discovery on the local Wi-Fi network.",
      type: "boolean",
      value: settings?.companion?.mdnsDiscovery ?? true,
      onChange: (v) => {
        updateCompanionSettings({ mdnsDiscovery: Boolean(v) })
        showToast(`Companion mDNS discovery ${v ? "enabled" : "disabled"}`)
      },
      isFutureNotice: true,
    },
    {
      id: "companion.pairingPin",
      category: "Companion",
      title: "Companion: One-Time Security PIN",
      description:
        "Six-digit verification security PIN required by the remote tablet client during first-time pairing.",
      type: "text",
      value: settings?.companion?.pairingPin ?? "784-291",
      onChange: (v) => {
        updateCompanionSettings({ pairingPin: v })
      },
      isFutureNotice: true,
    },
    {
      id: "companion.allowRemoteEdit",
      category: "Companion",
      title: "Companion: Allow Remote File Editing",
      description:
        "Permit connected remote tablet companions to save file modifications and trigger terminal tasks.",
      type: "boolean",
      value: settings?.companion?.allowRemoteEdit ?? true,
      onChange: (v) => {
        updateCompanionSettings({ allowRemoteEdit: Boolean(v) })
        showToast(`Remote file editing ${v ? "allowed" : "restricted"}`)
      },
      isFutureNotice: true,
    },

    // 7. AI Agents
    // 7.1 General Settings
    {
      id: "agent.defaultProvider",
      category: "AI",
      title: "AI: Default Provider",
      description: "Default AI provider used when creating new agent sessions.",
      type: "select",
      value: settings?.agent?.defaultProvider ?? "antigravity",
      options: CHAT_PROVIDERS.map((p) => p.id),
      onChange: (v) => {
        const prov = v as ChatProvider
        const models = getMergedProviderModels(
          prov,
          settings?.agent?.customModels,
        )
        const fallbackModel = models[0]?.id || "gemini-3.8-flash"
        updateAgentSettings?.((prev) => ({
          ...prev,
          defaultProvider: prov,
          model: fallbackModel,
        }))
        showToast(`Default AI provider set to ${prov}`)
      },
    },
    {
      id: "agent.model",
      category: "AI",
      title: "AI: Default Model",
      description:
        "Default model corresponding to the active default provider.",
      type: "select",
      value: settings?.agent?.model ?? "gemini-3.8-flash",
      options: getMergedProviderModels(
        (settings?.agent?.defaultProvider ?? "antigravity") as ChatProvider,
        settings?.agent?.customModels,
      ).map((m) => m.id),
      onChange: (v) => {
        updateAgentSettings?.({ model: v })
        showToast(`Default model set to ${v}`)
      },
    },
    {
      id: "agent.temperature",
      category: "AI",
      title: "AI: Model Sampling Temperature",
      description:
        "Controls creativity and determinism of agent coding solutions (0.2 = strict, 0.7 = balanced).",
      type: "select",
      value: String(settings?.agent?.temperature ?? "0.7"),
      options: ["0.2", "0.5", "0.7", "1.0"],
      onChange: (v) => {
        updateAgentSettings?.({ temperature: Number(v) || 0.7 })
        showToast(`Agent temperature set to ${v}`)
      },
    },
    {
      id: "agent.modelStreaming",
      category: "AI",
      title: "AI: Streaming Token Telemetry",
      description:
        "Renders model response tokens incrementally with live markdown streaming.",
      type: "boolean",
      value: settings?.agent?.streaming ?? true,
      onChange: (v) => {
        updateAgentSettings?.({ streaming: Boolean(v) })
        showToast(`Agent token streaming ${v ? "enabled" : "disabled"}`)
      },
    },
    {
      id: "agent.autoContext",
      category: "AI",
      title: "AI: Auto Context Ingestion",
      description:
        "Automatically extracts active editor tab buffer and cursor selection into agent prompts.",
      type: "boolean",
      value: settings?.agent?.contextIngestion ?? true,
      onChange: (v) => {
        updateAgentSettings?.({ contextIngestion: Boolean(v) })
        showToast(`Agent auto context ${v ? "enabled" : "disabled"}`)
      },
    },

    // 7.2 Antigravity Provider
    {
      id: "agent.antigravity.command",
      category: "AI",
      title: "Antigravity: CLI Command / Path",
      description:
        "Local command or binary path used for OAuth manual login and token lifecycle (default: antigravity).",
      type: "text",
      value: settings?.agent?.bypassCommands?.antigravity ?? "antigravity",
      onChange: (v) => {
        updateAgentSettings?.((prev) => ({
          ...prev,
          bypassCommands: { ...prev.bypassCommands, antigravity: v },
        }))
      },
    },

    // 7.3 Claude Provider
    {
      id: "agent.claude.command",
      category: "AI",
      title: "Claude: CLI Command / Path",
      description:
        "Local command or binary path used for Claude OAuth manual login and token lifecycle (default: claude).",
      type: "text",
      value: settings?.agent?.bypassCommands?.claude ?? "claude",
      onChange: (v) => {
        updateAgentSettings?.((prev) => ({
          ...prev,
          bypassCommands: { ...prev.bypassCommands, claude: v },
        }))
      },
    },

    // 7.4 OpenCode Provider
    {
      id: "agent.opencode.baseUrl",
      category: "AI",
      title: "OpenCode: API Base URL",
      description: "OpenAI-compatible endpoint URL for OpenCode gateway.",
      type: "text",
      value:
        settings?.agent?.providerBaseUrls?.opencode ??
        "https://api.opencode.ai/v1",
      onChange: (v) => {
        updateAgentSettings?.((prev) => ({
          ...prev,
          providerBaseUrls: { ...prev.providerBaseUrls, opencode: v },
        }))
      },
    },
    {
      id: "agent.opencode.apiKey",
      category: "AI",
      title: "OpenCode: API Key",
      description: "API authorization token for OpenCode gateway.",
      type: "password",
      value: settings?.agent?.providerKeys?.opencode ?? "",
      onChange: (v) => {
        updateAgentSettings?.((prev) => ({
          ...prev,
          providerKeys: { ...prev.providerKeys, opencode: v },
        }))
      },
    },

    // 7.5 OpenRouter Provider
    {
      id: "agent.openrouter.apiKey",
      category: "AI",
      title: "OpenRouter: API Key",
      description: "OpenRouter authorization key (https://openrouter.ai/keys).",
      type: "password",
      value: settings?.agent?.providerKeys?.openrouter ?? "",
      onChange: (v) => {
        updateAgentSettings?.((prev) => ({
          ...prev,
          providerKeys: { ...prev.providerKeys, openrouter: v },
        }))
      },
    },
  ]
}

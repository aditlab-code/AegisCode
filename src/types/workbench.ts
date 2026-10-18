import type { ReactNode } from "react"

export type IconName = "aegis" | "arrow-down" | "arrow-up" | "bell" | "branch" | "check" | "chevron" | "chevron-down" | "chevron-up" | "close" | "close-all" | "code" | "copy" | "error" | "explorer" | "file" | "folder" | "git" | "history" | "layout" | "maximize" | "moon" | "more" | "panel" | "play" | "plus" | "refresh" | "search" | "send" | "settings" | "split" | "sun" | "symbol" | "terminal" | "trash" | "warning" | "edit" | "add" | "replace-all" | "cloud" | "sparkle" | "tag" | "discard" | "collapse-all" | "brain" | "debug" | "pause" | "step-over" | "step-into" | "step-out" | "stop" | "zoom-in" | "zoom-out" | "fit-screen" | "table" | "image" | "bold" | "italic" | "heading" | "list" | "link" | "eye" | "wrap-text" | "sidebar-left" | "sidebar-right" | "zap" | "stash" | "cherry-pick" | "lock" | "unlock" | "shield"

export type ThemeMode = "dark" | "light"
export type ThemePaletteId = "default" | "atom" | "tokyo-night"

export interface EditorSettings {
  accessibilityPageSize: number
  fontSize: number
  fontFamily: string
  lineHeight: number
  wordWrap: "off" | "on" | "wordWrapColumn"
  wordWrapColumn: number
  tabSize: number
  insertSpaces: boolean
  cursorBlinking: "smooth" | "blink" | "solid"
  renderWhitespace: "none" | "selection" | "all"
  formatOnSave: boolean
  minimapEnabled: boolean
  minimapScale: MinimapScale
  minimapSide: "right" | "left"
  diffEditor: {
    renderSideBySide: boolean
    ignoreTrimWhitespace: boolean
    inheritEditorFont: boolean
  }
}

export interface WorkbenchAppearanceSettings {
  palette: ThemePaletteId
  mode: ThemeMode
  fontSize: number
  fontFamily: string
  lineHeight: number
}

export interface FilesSettings {
  autoSave: "off" | "afterDelay" | "onFocusChange"
  autoSaveDelay: number
  trimTrailingWhitespace: boolean
  insertFinalNewline: boolean
  eol: "\n" | "\r\n"
  exclude: string[]
}

export interface FeaturesSettings {
  sourceControl: {
    maxVisibleChanges: number
    graphPageSize: number
  }
  timeline: {
    maxVisibleItems: number
  }
  comments: {
    enableTodoHighlight: boolean
    todoKeywords: string
  }
  terminal: {
    sseEnabled: boolean
    shortcut: string
    cursorStyle: "block" | "line" | "underline"
    cursorBlinking: boolean
    fontSize: number
    fontFamily: string
    lineHeight: number
  }
  lsp?: {
    formatOnSave?: boolean
    servers?: Record<string, string>
  }
}

export interface CompanionSettings {
  port: number
  mdnsDiscovery: boolean
  pairingPin: string
  allowRemoteEdit: boolean
}

export interface AgentSettings {
  defaultProvider: ChatProvider
  model: string
  temperature: number
  streaming: boolean
  contextIngestion: boolean
  providerKeys: Record<string, string>
  providerBaseUrls: Record<string, string>
  bypassCommands: Record<string, string>
  customModels: Record<string, string[]>
}

export interface AppSettings {
  editor: EditorSettings
  workbench: {
    appearance: WorkbenchAppearanceSettings
    sidebarPosition: "left" | "right"
    compactFolders: boolean
  }
  files: FilesSettings
  features: FeaturesSettings
  companion: CompanionSettings
  linter: LinterSettings
  agent: AgentSettings
}

export type ChatProvider = "antigravity" | "claude" | "opencode" | "openrouter"

export interface ProviderModel {
  id: string
  name: string
  provider: ChatProvider
  description?: string
  isCustom?: boolean
}

export interface ChatSession {
  id: string
  title: string
  provider: ChatProvider
  model: string
  messages: ChatMessage[]
  createdAt: number
  workspacePath?: string
  conversationId?: string
}

export interface SkillCommand {
  command: string
  name: string
  description: string
  scope?: "workspace" | "system"
  source?: string
}

export type ActivityType = "Explorer" | "Search" | "Source Control" | "Debug" | "Settings"

export interface FileItem {
  id?: string
  depth: number
  icon: "file" | "folder"
  label: string
  path: string
  name?: string
  type?: "file" | "folder"
  open?: boolean
  active?: boolean
  muted?: boolean
  children?: FileItem[]
  modified?: boolean
}

export interface EditorGroupState {
  id: "group1" | "group2"
  name: string
  tabs: string[]
  activeTab: string
}

export type BufferStatus = "idle" | "loading" | "ready" | "error"

export interface FileBuffer {
  content: string
  savedContent?: string
  isDirty: boolean
  language: string
  hasDiskConflict?: boolean
  isDeletedOnDisk?: boolean
  isLargeFile?: boolean
  isBinary?: boolean
  fileSize?: number
  status?: BufferStatus
  lastSaved?: number
}

export interface WorkspaceChangeEvent {
  created: string[]
  modified: string[]
  deleted: string[]
}

export type MinimapScale = "small" | "medium" | "large"

export interface FindWidgetState {
  isOpen: boolean
  isReplaceOpen: boolean
}

export interface CursorPosition {
  line: number
  col: number
}

export interface LinterSettings {
  enabled: boolean
  trigger: "onType" | "onSave"
  showWarnings: boolean
}

export interface DiagnosticItem {
  id: string
  title: string
  location: string
  type: "error" | "warning"
  source: string
}

export interface NotificationItem {
  id: string
  title: string
  detail: string
  time: string
  read: boolean
  level?: "info" | "warning" | "error" | "success"
}

export interface ContextItem {
  id: string
  type: "file" | "folder" | "selection"
  path: string
  lineRange?: string
  content: string
  charCount: number
  estimatedTokens: number
  isTruncated?: boolean
  mode: "selection" | "full" | "reference" | "snippet"
  rawBuffer?: string
}

export interface EditorSelectionRange {
  startLine: number
  endLine: number
  selectedText: string
}

export interface GotoLineEventDetail {
  line: number
  col?: number
  length?: number
  preventFocus?: boolean
  file?: string
}

export interface ToolCallItem {
  id: string
  name: string
  summary?: string
  status: "running" | "success" | "error"
  targetFile?: string
  args?: Record<string, any>
  output?: string
  blobRef?: string
  preview?: string
}

export interface SessionDescriptor {
  id: string
  title: string
  provider: ChatProvider
  model: string
  createdAt: number
  updatedAt: number
  rootNodeId?: string
  activeLeafId?: string
  nodeCount: number
  totalTokens?: number
}

export interface SessionsIndex {
  version: number
  updatedAt: number
  sessions: SessionDescriptor[]
}

export interface GraphNode {
  id: string
  parent?: string | null
  type: "user" | "thought" | "tool_call" | "tool_result" | "agent" | "checkpoint"
  text?: string
  content?: string
  tool?: string
  args?: Record<string, any>
  output?: string
  blobRef?: string
  preview?: string
  ts: number
  meta?: Record<string, any>
}

export interface ChatMessage {
  id: string
  role: "agent" | "user" | "system"
  text: string
  timestamp?: number
  context?: ContextItem[]
  provider?: ChatProvider
  model?: string
  thinking?: string
  toolCalls?: ToolCallItem[]
  isStreaming?: boolean
  error?: string
}

export interface GitUser {
  name: string
  email: string
}

export interface GitBranch {
  name: string
  isHead: boolean
  isRemote: boolean
  upstream?: string
}

export interface GitDiffResult {
  file: string
  staged: boolean
  diff: string
  original: string
  modified: string
}

export interface GitCompareChange {
  status: string
  file: string
}

export interface GitCompareResult {
  baseCommit: string
  targetCommit: string
  files: GitCompareChange[]
  totalChanges: number
}

export interface GitStashEntry {
  index: number
  ref: string
  message: string
  timestamp: string
}

export interface GitCloneResult {
  status: string
  rootPath: string
  name: string
}

export interface GitChange {
  code: "M" | "A" | "D" | "R" | "C" | "U" | "?"
  file: string
  directory?: string
  status?: string
  oldFile?: string
  additions?: number
  deletions?: number
}

export interface GitStatusData {
  isRepo: boolean
  branch: string
  repoName: string
  commitHash?: string
  upstream?: string
  ahead: number
  behind: number
  staged: GitChange[]
  unstaged: GitChange[]
  user: GitUser
}

export interface MenuItem {
  label: string
  shortcut: string
  action: string
}

export interface MenuGroup {
  label: string
  items: [string, string, string][]
}

export type BottomTab = "Terminal" | "Problems" | "Output" | "Debug Console"

export interface DebugConsoleMessage {
  id: string
  category: "stdout" | "stderr" | "info" | "input" | "error"
  message: string
  timestamp: string
}

export interface TerminalSession {
  id: string
  name: string
  shell: string
  lines: string[]
  running: boolean
  commandHistory: string[]
  isLive?: boolean
}

export type OutputChannel = "Linter" | "Tasks" | "Git" | "Server"

export interface GitCommitNode {
  id: string
  hash: string
  shortHash?: string
  message: string
  author: string
  email?: string
  time?: string
  timestamp?: string
  unixTime?: number
  branch?: string
  isHead?: boolean
  tags?: string[]
}

export interface GitRepo {
  id: string
  name: string
  branch: string
  path: string
}

export interface OutlineSymbol {
  id?: string
  name: string
  kind: "function" | "class" | "type" | "variable" | "hook" | "interface"
  line: number
}

export interface PanelDimensions {
  sidebarWidth: number
  chatDrawerWidth: number
  bottomPanelHeight: number
}

// --- DAP Debugger Domain Types (Sub-Phase 6.5) ---

export interface StackFrame {
  id: number
  name: string
  file: string
  line: number
  column: number
}

export interface VariableItem {
  name: string
  value: string
  type: string
  variablesReference?: number
}

export interface ThreadItem {
  id: number
  name: string
}

export interface Breakpoint {
  id?: number
  file: string
  line: number
  verified: boolean
  message?: string
}

export interface DebugState {
  active: boolean
  status: "idle" | "running" | "stopped" | "terminated"
  currentFile?: string
  currentLine?: number
  stopReason?: string
  stackFrames?: StackFrame[]
  variables?: VariableItem[]
  threads?: ThreadItem[]
}

export interface StreamDebugEvent {
  type: "debug:started" | "debug:stopped" | "debug:continued" | "debug:output" | "debug:terminated"
  status?: string
  currentFile?: string
  currentLine?: number
  reason?: string
  output?: string
  category?: "stdout" | "stderr" | "console"
  state?: DebugState
}

export interface ConfirmCloseState {
  group: "group1" | "group2"
  filename: string
}

export type { WorkbenchContextType } from "../context/WorkbenchContext"

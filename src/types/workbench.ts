import type { ReactNode } from "react"

export type IconName = "aegis" | "arrow-down" | "arrow-up" | "bell" | "branch" | "check" | "chevron" | "chevron-down" | "chevron-up" | "close" | "code" | "copy" | "error" | "explorer" | "file" | "folder" | "git" | "history" | "layout" | "maximize" | "moon" | "more" | "panel" | "play" | "plus" | "refresh" | "search" | "send" | "settings" | "split" | "sun" | "symbol" | "terminal" | "trash" | "warning" | "edit" | "add" | "replace-all"

export type ThemeMode = "dark" | "light"

export type ChatProvider = "antigravity" | "opencode" | "openrouter"

export interface ProviderModel {
  id: string
  name: string
  provider: ChatProvider
  description?: string
}

export interface ChatSession {
  id: string
  title: string
  provider: ChatProvider
  model: string
  messages: ChatMessage[]
  createdAt: number
}

export interface SkillCommand {
  command: string
  name: string
  description: string
}

export type ActivityType = "Explorer" | "Search" | "Source Control" | "Settings"

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

export interface FileBuffer {
  content: string
  isDirty: boolean
  language: string
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
}

export interface ChatMessage {
  id: string
  role: "agent" | "user"
  text: string
}

export interface GitChange {
  code: "M" | "A" | "D"
  file: string
  directory?: string
  status?: string
  additions?: number
  deletions?: number
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

export type BottomTab = "Terminal" | "Problems" | "Output"

export interface TerminalSession {
  id: string
  name: string
  shell: string
  lines: string[]
  running: boolean
  commandHistory: string[]
}

export type OutputChannel = "Linter" | "Tasks" | "Git"

export interface GitCommitNode {
  id: string
  hash: string
  message: string
  author: string
  time?: string
  timestamp?: string
  branch: string
  isHead?: boolean
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

export type { WorkbenchContextType } from "../context/core/workbenchFacade"

import type { ReactNode } from "react"

export type IconName = "aegis" | "bell" | "branch" | "chevron" | "close" | "code" | "copy" | "error" | "explorer" | "file" | "folder" | "git" | "layout" | "more" | "panel" | "play" | "search" | "send" | "settings" | "split" | "terminal" | "warning"

export type ActivityType = "Explorer" | "Search" | "Source Control" | "Settings"

export interface FileItem {
  depth: number
  icon: "file" | "folder"
  label: string
  open?: boolean
  active?: boolean
  muted?: boolean
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
  directory: string
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

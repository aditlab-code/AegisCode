import type {
  ChatProvider,
  ProviderModel,
  SkillCommand,
} from "../types/workbench"

export interface ProviderItem {
  id: ChatProvider
  name: string
  tag: string
}

export const CHAT_PROVIDERS: ProviderItem[] = [
  { id: "antigravity", name: "Antigravity", tag: "AGY" },
  { id: "opencode", name: "OpenCode", tag: "OC" },
  { id: "openrouter", name: "OpenRouter", tag: "OR" },
]

export const CHAT_MODELS: Record<ChatProvider, ProviderModel[]> = {
  antigravity: [
    {
      id: "gemini-2.5-flash",
      name: "gemini-2.5-flash",
      provider: "antigravity",
      description: "Fast, low-latency code assistance & rapid iterations",
    },
    {
      id: "gemini-2.5-pro",
      name: "gemini-2.5-pro",
      provider: "antigravity",
      description: "Deep reasoning, large multi-file analysis & architecture",
    },
  ],
  opencode: [
    {
      id: "claude-3.7-sonnet",
      name: "claude-3.7-sonnet",
      provider: "opencode",
      description: "Advanced coding, agentic reasoning & refactoring",
    },
    {
      id: "claude-3.5-haiku",
      name: "claude-3.5-haiku",
      provider: "opencode",
      description: "Lightweight, instant completions & quick fixes",
    },
  ],
  openrouter: [
    {
      id: "deepseek-r1",
      name: "deepseek-r1",
      provider: "openrouter",
      description: "Open reasoning model with step-by-step thinking",
    },
    {
      id: "claude-3.7-sonnet",
      name: "claude-3.7-sonnet",
      provider: "openrouter",
      description: "High intelligence via OpenRouter gateway",
    },
    {
      id: "gpt-4o",
      name: "gpt-4o",
      provider: "openrouter",
      description: "Omni model for code generation and multi-turn chat",
    },
  ],
}

export const SKILL_COMMANDS: SkillCommand[] = [
  {
    command: "/spec",
    name: "Specification",
    description: "Buat spesifikasi kebutuhan & arsitektur fitur",
  },
  {
    command: "/plan",
    name: "Implementation Plan",
    description: "Breakdown task implementasi bertahap",
  },
  {
    command: "/review",
    name: "Code Review",
    description: "Audit kualitas, clean code, & keamanan kode",
  },
  {
    command: "/debug",
    name: "Debugging",
    description: "Analisis akar masalah & perbaikan bug",
  },
  {
    command: "/simplify",
    name: "Simplification",
    description: "Refaktorisasi & penyederhanaan struktur kode",
  },
]

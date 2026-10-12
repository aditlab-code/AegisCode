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
  { id: "claude", name: "Claude", tag: "CLD" },
  { id: "opencode", name: "OpenCode", tag: "OC" },
  { id: "openrouter", name: "OpenRouter", tag: "OR" },
]

export const CHAT_MODELS: Record<ChatProvider, ProviderModel[]> = {
  antigravity: [
    {
      id: "gemini-3.8-flash",
      name: "gemini-3.8-flash",
      provider: "antigravity",
      description: "Fast, low-latency code assistance & rapid iterations",
    },
    {
      id: "gemini-3.8-medium",
      name: "gemini-3.8-medium",
      provider: "antigravity",
      description: "Balanced reasoning, multi-file analysis & planning",
    },
    {
      id: "gemini-3.8-flash-high",
      name: "gemini-3.8-flash-high",
      provider: "antigravity",
      description: "Gemini 3.8 Flash (High) - Flagship high-speed reasoning",
    },
    {
      id: "gemini-3.8-flash-medium",
      name: "gemini-3.8-flash-medium",
      provider: "antigravity",
      description:
        "Gemini 3.8 Flash (Medium) - Balanced speed and code generation",
    },
    {
      id: "gemini-3.8-flash-low",
      name: "gemini-3.8-flash-low",
      provider: "antigravity",
      description:
        "Gemini 3.8 Flash (Low) - Ultra low-latency instant iterations",
    },
    {
      id: "gemini-3.7-flash-high",
      name: "gemini-3.7-flash-high",
      provider: "antigravity",
      description: "Gemini 3.7 Flash (High) - Proven stable multi-turn coding",
    },
    {
      id: "gemini-3.1-pro-high",
      name: "gemini-3.1-pro-high",
      provider: "antigravity",
      description:
        "Gemini 3.1 Pro (High) - Deep reasoning for complex architectures",
    },
    {
      id: "claude-sonnet-4-6",
      name: "claude-sonnet-4-6",
      provider: "antigravity",
      description: "Claude Sonnet 4.6 (Thinking) via Antigravity runtime",
    },
    {
      id: "claude-opus-4-6-thinking",
      name: "claude-opus-4-6-thinking",
      provider: "antigravity",
      description: "Claude Opus 4.6 (Thinking) - Maximum reasoning capacity",
    },
  ],
  claude: [
    {
      id: "claude-3.7-sonnet",
      name: "claude-3.7-sonnet",
      provider: "claude",
      description: "Hybrid reasoning, advanced architecture & refactoring",
    },
    {
      id: "claude-3.5-haiku",
      name: "claude-3.5-haiku",
      provider: "claude",
      description: "Instant completions & lightweight coding assistance",
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
    {
      id: "gpt-4o",
      name: "gpt-4o",
      provider: "opencode",
      description: "Omni model for code generation and multi-turn chat",
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

/**
 * Returns merged provider models containing both default and custom user models.
 */
export function getMergedProviderModels(
  provider: ChatProvider,
  customModelsMap?: Record<string, string[]>,
): ProviderModel[] {
  const defaults = CHAT_MODELS[provider] || []
  const customList = customModelsMap?.[provider] || []
  if (customList.length === 0) return defaults

  // Filter out duplicates if custom list contains existing default IDs
  const defaultIds = new Set(defaults.map((m) => m.id))
  const newCustomModels: ProviderModel[] = customList
    .filter((id) => !defaultIds.has(id))
    .map((modelId) => ({
      id: modelId,
      name: modelId,
      provider,
      description: "Custom user-configured model",
      isCustom: true,
    }))

  return [...defaults, ...newCustomModels]
}

export const SKILL_COMMANDS: SkillCommand[] = [
  {
    command: "/spec",
    name: "Specification",
    description: "Create requirements specification & feature architecture",
  },
  {
    command: "/plan",
    name: "Implementation Plan",
    description: "Phased implementation task breakdown",
  },
  {
    command: "/review",
    name: "Code Review",
    description: "Audit code quality, clean code standards, & security",
  },
  {
    command: "/debug",
    name: "Debugging",
    description: "Root cause analysis & bug fixing",
  },
  {
    command: "/simplify",
    name: "Simplification",
    description: "Refactoring & code structure simplification",
  },
]

import type { BottomTab, ThemeMode } from "../../types/workbench"

export const DEFAULT_SIDEBAR_WIDTH = 260
export const MIN_SIDEBAR_WIDTH = 220
export const MAX_SIDEBAR_WIDTH = 460
export const COLLAPSE_SIDEBAR_THRESHOLD = 160

export const DEFAULT_CHAT_WIDTH = 340
export const MIN_CHAT_WIDTH = 300
export const MAX_CHAT_WIDTH = 600
export const COLLAPSE_CHAT_THRESHOLD = 180

export const DEFAULT_CHAT_EXPANDED_WIDTH = 500
export const MIN_CHAT_EXPANDED_WIDTH = 480
export const COLLAPSE_CHAT_EXPANDED_THRESHOLD = 320

export const DEFAULT_BOTTOM_HEIGHT = 180
export const MIN_BOTTOM_HEIGHT = 100

export const DEFAULT_BOTTOM_TAB_ORDER: BottomTab[] = [
  "Terminal",
  "Problems",
  "Output",
  "Debug Console",
]

// Pure transition functions
export function reorderBottomTabsLogic(
  order: BottomTab[],
  sourceIndex: number,
  targetIndex: number,
): BottomTab[] {
  if (
    sourceIndex < 0 ||
    sourceIndex >= order.length ||
    targetIndex < 0 ||
    targetIndex >= order.length ||
    sourceIndex === targetIndex
  ) {
    return order
  }
  const next = [...order]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}

export function toggleThemeLogic(current: ThemeMode): ThemeMode {
  return current === "dark" ? "light" : "dark"
}

export function loadStoredBottomTabOrder(): BottomTab[] {
  if (typeof window === "undefined") return DEFAULT_BOTTOM_TAB_ORDER
  try {
    const raw = window.localStorage.getItem("aegis_bottom_panel_tab_order")
    if (raw) {
      const parsed = JSON.parse(raw) as (string | BottomTab)[]
      if (Array.isArray(parsed)) {
        const migrated = parsed.map((t) =>
          t === "Debug" ? "Debug Console" : t,
        ) as BottomTab[]
        if (
          migrated.includes("Terminal") &&
          migrated.includes("Problems") &&
          migrated.includes("Output")
        ) {
          if (!migrated.includes("Debug Console")) {
            migrated.push("Debug Console")
          }
          return migrated.filter(
            (t): t is BottomTab =>
              t === "Terminal" ||
              t === "Problems" ||
              t === "Output" ||
              t === "Debug Console",
          )
        }
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_BOTTOM_TAB_ORDER
}

export function loadStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark"
  try {
    const stored = window.localStorage.getItem("aegis_theme")
    if (stored === "light" || stored === "dark") return stored
  } catch {
    // fallback
  }
  return "dark"
}

export function loadStoredNumber(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw) {
      const val = parseInt(raw, 10)
      if (!isNaN(val) && val >= min && val <= max) {
        return val
      }
    }
  } catch {
    // fallback
  }
  return fallback
}

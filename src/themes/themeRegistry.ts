import defaultDark from "./default-dark.json"
import defaultLight from "./default-light.json"
import atomDark from "./atom-dark.json"
import atomLight from "./atom-light.json"
import tokyoNightDark from "./tokyo-night-dark.json"
import tokyoNightLight from "./tokyo-night-light.json"

export type ThemePaletteId = "default" | "atom" | "tokyo-night"
export type ThemeMode = "dark" | "light"

export interface ThemePaletteDefinition {
  id: string
  name: string
  palette: ThemePaletteId
  mode: ThemeMode
  tokens: Record<string, string>
}

export interface PaletteOption {
  id: ThemePaletteId
  name: string
  description: string
}

export const PALETTE_OPTIONS: PaletteOption[] = [
  {
    id: "default",
    name: "Default (Aegis)",
    description: "Default modern dark & clean light balanced aesthetic",
  },
  {
    id: "atom",
    name: "Atom (One)",
    description: "Iconic One Dark & One Light syntax-focused palette",
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    description: "Vibrant neon-accented Tokyo Night & Day aesthetic",
  },
]

const THEMES_REGISTRY: Record<string, ThemePaletteDefinition> = {
  "default-dark": defaultDark as ThemePaletteDefinition,
  "default-light": defaultLight as ThemePaletteDefinition,
  "atom-dark": atomDark as ThemePaletteDefinition,
  "atom-light": atomLight as ThemePaletteDefinition,
  "tokyo-night-dark": tokyoNightDark as ThemePaletteDefinition,
  "tokyo-night-light": tokyoNightLight as ThemePaletteDefinition,
}

export function getThemeKey(palette: ThemePaletteId, mode: ThemeMode): string {
  const cleanPalette =
    palette in { default: 1, atom: 1, "tokyo-night": 1 } ? palette : "default"
  const cleanMode = mode === "light" ? "light" : "dark"
  return `${cleanPalette}-${cleanMode}`
}

export function getThemeDefinition(
  palette: ThemePaletteId,
  mode: ThemeMode,
): ThemePaletteDefinition {
  const key = getThemeKey(palette, mode)
  return THEMES_REGISTRY[key] || THEMES_REGISTRY["default-dark"]
}

export function getAllThemeDefinitions(): ThemePaletteDefinition[] {
  return Object.values(THEMES_REGISTRY)
}

export function applyThemeToDom(
  palette: ThemePaletteId,
  mode: ThemeMode,
): void {
  if (typeof document === "undefined") return

  const theme = getThemeDefinition(palette, mode)
  const root = document.documentElement

  // Set root standard attributes for Tailwind and CSS data selector hooks
  root.setAttribute("data-theme", theme.mode)
  root.setAttribute("data-palette", theme.palette)
  root.setAttribute("data-theme-id", theme.id)

  // Apply CSS custom tokens to root style directly
  Object.entries(theme.tokens).forEach(([tokenName, tokenValue]) => {
    root.style.setProperty(tokenName, tokenValue)
  })
}

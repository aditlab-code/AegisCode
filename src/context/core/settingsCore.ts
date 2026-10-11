import { useCallback, useEffect, useState } from "react"
import type {
  AppSettings,
  EditorSettings,
  WorkbenchAppearanceSettings,
  FeaturesSettings,
  CompanionSettings,
  FilesSettings,
  LinterSettings,
  AgentSettings,
  ThemeMode,
  ThemePaletteId,
} from "../../types/workbench"
import { applyThemeToDom } from "../../themes/themeRegistry"
import { fetchBackendConfig, saveBackendConfig } from "../../utils/storeApi"

const SETTINGS_STORAGE_KEY = "aegis_user_settings"

export const DEFAULT_APP_SETTINGS: AppSettings = {
  editor: {
    accessibilityPageSize: 500,
    fontSize: 13.5,
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    lineHeight: 22,
    wordWrap: "off",
    wordWrapColumn: 80,
    tabSize: 2,
    insertSpaces: true,
    cursorBlinking: "smooth",
    renderWhitespace: "selection",
    formatOnSave: true,
    minimapEnabled: true,
    minimapScale: "medium",
    minimapSide: "right",
    diffEditor: {
      renderSideBySide: true,
      ignoreTrimWhitespace: false,
      inheritEditorFont: true,
    },
  },
  workbench: {
    appearance: {
      palette: "default",
      mode: "dark",
      fontSize: 12,
      fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      lineHeight: 1.4,
    },
    sidebarPosition: "left",
    compactFolders: true,
  },
  files: {
    autoSave: "afterDelay",
    autoSaveDelay: 1000,
    trimTrailingWhitespace: true,
    insertFinalNewline: true,
    eol: "\n",
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/target/**",
      "**/.DS_Store",
    ],
  },
  features: {
    sourceControl: {
      maxVisibleChanges: 50,
      graphPageSize: 25,
    },
    timeline: {
      maxVisibleItems: 30,
    },
    comments: {
      enableTodoHighlight: true,
      todoKeywords: "TODO, FIXME, NOTE, BUG, HACK",
    },
    terminal: {
      sseEnabled: true,
      shortcut: "Ctrl+`",
      cursorStyle: "block",
      cursorBlinking: true,
      fontSize: 12,
      fontFamily: "SFMono-Regular, Menlo, monospace",
      lineHeight: 1.4,
    },
  },
  companion: {
    port: 8080,
    mdnsDiscovery: true,
    pairingPin: "784-291",
    allowRemoteEdit: true,
  },
  linter: {
    enabled: true,
    trigger: "onType",
    showWarnings: true,
  },
  agent: {
    defaultProvider: "antigravity",
    model: "gemini-3.8-flash",
    temperature: 0.7,
    streaming: true,
    contextIngestion: true,
    providerKeys: {},
    providerBaseUrls: {
      opencode: "https://api.opencode.ai/v1",
    },
    bypassCommands: {
      antigravity: "antigravity",
      claude: "claude",
    },
    customModels: {
      antigravity: [],
      claude: [],
      opencode: [],
      openrouter: [],
    },
  },
}

export function loadStoredSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_APP_SETTINGS

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    let parsed: any = null
    if (raw) {
      parsed = JSON.parse(raw)
    }

    // Legacy fallbacks / migration
    const legacyTheme = window.localStorage.getItem("aegis_theme") as ThemeMode
    const legacyMinimap = window.localStorage.getItem("aegis_minimap_enabled")
    const legacyScale = window.localStorage.getItem("aegis_minimap_scale")
    const legacyTabSize = window.localStorage.getItem("aegis_tab_size")

    return {
      editor: {
        ...DEFAULT_APP_SETTINGS.editor,
        ...(parsed?.editor || {}),
        minimapEnabled:
          parsed?.editor?.minimapEnabled ??
          (legacyMinimap !== null
            ? legacyMinimap === "true"
            : DEFAULT_APP_SETTINGS.editor.minimapEnabled),
        minimapScale:
          parsed?.editor?.minimapScale ??
          (legacyScale === "small" ||
          legacyScale === "medium" ||
          legacyScale === "large"
            ? legacyScale
            : DEFAULT_APP_SETTINGS.editor.minimapScale),
        tabSize:
          parsed?.editor?.tabSize ??
          (legacyTabSize ? parseInt(legacyTabSize, 10) : 2),
        diffEditor: {
          ...DEFAULT_APP_SETTINGS.editor.diffEditor,
          ...(parsed?.editor?.diffEditor || {}),
        },
      },
      workbench: {
        appearance: {
          ...DEFAULT_APP_SETTINGS.workbench.appearance,
          ...(parsed?.workbench?.appearance || {}),
          mode:
            parsed?.workbench?.appearance?.mode ??
            (legacyTheme === "light" ? "light" : "dark"),
        },
        sidebarPosition:
          parsed?.workbench?.sidebarPosition ??
          DEFAULT_APP_SETTINGS.workbench.sidebarPosition,
        compactFolders:
          parsed?.workbench?.compactFolders ??
          DEFAULT_APP_SETTINGS.workbench.compactFolders,
      },
      files: {
        ...DEFAULT_APP_SETTINGS.files,
        ...(parsed?.files || {}),
      },
      features: {
        sourceControl: {
          ...DEFAULT_APP_SETTINGS.features.sourceControl,
          ...(parsed?.features?.sourceControl || {}),
        },
        timeline: {
          ...DEFAULT_APP_SETTINGS.features.timeline,
          ...(parsed?.features?.timeline || {}),
        },
        comments: {
          ...DEFAULT_APP_SETTINGS.features.comments,
          ...(parsed?.features?.comments || {}),
        },
        terminal: {
          ...DEFAULT_APP_SETTINGS.features.terminal,
          ...(parsed?.features?.terminal || {}),
        },
      },
      companion: {
        ...DEFAULT_APP_SETTINGS.companion,
        ...(parsed?.companion || {}),
      },
      linter: {
        ...DEFAULT_APP_SETTINGS.linter,
        ...(parsed?.linter || {}),
      },
      agent: {
        ...DEFAULT_APP_SETTINGS.agent,
        ...(parsed?.agent || {}),
      },
    }
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

export function saveStoredSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))

    // Sync legacy keys
    window.localStorage.setItem(
      "aegis_theme",
      settings.workbench.appearance.mode,
    )
    window.localStorage.setItem(
      "aegis_minimap_enabled",
      String(settings.editor.minimapEnabled),
    )
    window.localStorage.setItem(
      "aegis_minimap_scale",
      settings.editor.minimapScale,
    )
    window.localStorage.setItem(
      "aegis_tab_size",
      String(settings.editor.tabSize),
    )
  } catch {}
}

export function applyTypographyVariables(settings: AppSettings): void {
  if (typeof document === "undefined") return
  const root = document.documentElement

  // Editor typography tokens
  root.style.setProperty("--editor-font-size", `${settings.editor.fontSize}px`)
  root.style.setProperty("--editor-font-family", settings.editor.fontFamily)
  root.style.setProperty(
    "--editor-line-height",
    `${settings.editor.lineHeight}px`,
  )

  // Workbench typography tokens
  root.style.setProperty(
    "--workbench-font-size",
    `${settings.workbench.appearance.fontSize}px`,
  )
  root.style.setProperty(
    "--workbench-font-family",
    settings.workbench.appearance.fontFamily,
  )
  root.style.setProperty(
    "--workbench-line-height",
    String(settings.workbench.appearance.lineHeight),
  )
}

export function useSettingsCore() {
  const [settings, setSettings] = useState<AppSettings>(loadStoredSettings)

  // Hydrate settings from backend flat-file config (~/.aegis/config.json)
  useEffect(() => {
    fetchBackendConfig()
      .then((cfg) => {
        if (!cfg) return
        setSettings((prev) => {
          const next = { ...prev, ...(cfg.settings || {}) }
          const agentPatch: Partial<AgentSettings> = {}
          if (cfg.defaultProvider)
            agentPatch.defaultProvider = (cfg.defaultProvider as any)
          if (cfg.defaultModel) agentPatch.model = cfg.defaultModel
          if (cfg.providerKeys)
            agentPatch.providerKeys = {
              ...prev.agent.providerKeys,
              ...cfg.providerKeys,
            }
          if (cfg.providerBaseUrls)
            agentPatch.providerBaseUrls = {
              ...prev.agent.providerBaseUrls,
              ...cfg.providerBaseUrls,
            }
          if (cfg.bypassCommands)
            agentPatch.bypassCommands = {
              ...prev.agent.bypassCommands,
              ...cfg.bypassCommands,
            }
          if (cfg.customModels)
            agentPatch.customModels = {
              ...prev.agent.customModels,
              ...cfg.customModels,
            }

          return {
            ...next,
            agent: { ...next.agent, ...agentPatch },
          }
        })
      })
      .catch(() => {})
  }, [])

  // Apply theme & typography CSS properties whenever relevant settings change
  useEffect(() => {
    const { palette, mode } = settings.workbench.appearance
    applyThemeToDom(palette, mode)
    applyTypographyVariables(settings)
    saveStoredSettings(settings)
    saveBackendConfig({
      theme: mode,
      defaultProvider: settings.agent.defaultProvider,
      defaultModel: settings.agent.model,
      providerKeys: settings.agent.providerKeys,
      providerBaseUrls: settings.agent.providerBaseUrls,
      bypassCommands: settings.agent.bypassCommands,
      customModels: settings.agent.customModels,
      settings: settings as any,
    }).catch(() => {})
  }, [settings])

  const updateEditorSettings = useCallback(
    (
      updater: Partial<EditorSettings> | ((
        prev: EditorSettings,
      ) => EditorSettings),
    ) => {
      setSettings((prev) => ({
        ...prev,
        editor:
          typeof updater === "function"
            ? updater(prev.editor)
            : { ...prev.editor, ...updater },
      }))
    },
    [],
  )

  const updateWorkbenchSettings = useCallback(
    (
      updater: Partial<AppSettings["workbench"]> | Partial<WorkbenchAppearanceSettings> | ((
        prev: AppSettings["workbench"],
      ) => AppSettings["workbench"]),
    ) => {
      setSettings((prev) => {
        if (typeof updater === "function") {
          return { ...prev, workbench: updater(prev.workbench) }
        }
        if ("palette" in updater || "mode" in updater) {
          return {
            ...prev,
            workbench: {
              ...prev.workbench,
              appearance: {
                ...prev.workbench.appearance,
                ...updater as Partial<WorkbenchAppearanceSettings>,
              },
            },
          }
        }
        const wUpdate = updater as Partial<AppSettings["workbench"]>
        return {
          ...prev,
          workbench: {
            ...prev.workbench,
            ...wUpdate,
            appearance: {
              ...prev.workbench.appearance,
              ...(wUpdate.appearance || {}),
            },
          },
        }
      })
    },
    [],
  )

  const createSettingsUpdater =
    <K extends keyof AppSettings>(key: K) =>
    (
      updater: Partial<AppSettings[K]> | ((
        prev: AppSettings[K],
      ) => AppSettings[K]),
    ) => {
      setSettings((prev) => {
        const currentVal = prev[key]
        if (typeof updater === "function") {
          const fn = updater as (p: AppSettings[K]) => AppSettings[K]
          return {
            ...prev,
            [key]: fn(currentVal),
          }
        }
        return {
          ...prev,
          [key]: { ...currentVal, ...updater },
        }
      })
    }

  const updateFilesSettings = useCallback(createSettingsUpdater("files"), [])
  const updateFeaturesSettings = useCallback(
    createSettingsUpdater("features"),
    [],
  )
  const updateCompanionSettings = useCallback(
    createSettingsUpdater("companion"),
    [],
  )
  const updateLinterSettings = useCallback(createSettingsUpdater("linter"), [])
  const updateAgentSettings = useCallback(createSettingsUpdater("agent"), [])

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_APP_SETTINGS)
  }, [])

  // Convenience methods for theme
  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      updateWorkbenchSettings((prev) => ({
        ...prev,
        appearance: { ...prev.appearance, mode },
      }))
    },
    [updateWorkbenchSettings],
  )

  const setThemePalette = useCallback(
    (palette: ThemePaletteId) => {
      updateWorkbenchSettings((prev) => ({
        ...prev,
        appearance: { ...prev.appearance, palette },
      }))
    },
    [updateWorkbenchSettings],
  )

  const toggleThemeMode = useCallback(() => {
    updateWorkbenchSettings((prev) => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        mode: prev.appearance.mode === "dark" ? "light" : "dark",
      },
    }))
  }, [updateWorkbenchSettings])

  return {
    settings,
    setSettings,
    updateEditorSettings,
    updateWorkbenchSettings,
    updateFilesSettings,
    updateFeaturesSettings,
    updateCompanionSettings,
    updateLinterSettings,
    updateAgentSettings,
    resetSettings,
    setThemeMode,
    setThemePalette,
    toggleThemeMode,
  }
}

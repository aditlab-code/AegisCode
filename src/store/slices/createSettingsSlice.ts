import type {
  AppSettings,
  EditorSettings,
  FeaturesSettings,
  CompanionSettings,
  FilesSettings,
  LinterSettings,
  AgentSettings,
  ThemeMode,
  ThemePaletteId,
  WorkbenchAppearanceSettings,
} from "../../types/workbench"
import type { SettingsSlice, SliceCreator, WorkbenchStore } from "../types"
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
    lsp: {
      formatOnSave: true,
      servers: {},
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
    const raw =
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) ||
      window.localStorage.getItem("aegis_settings_v1")
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
    const serialized = JSON.stringify(settings)
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, serialized)
    window.localStorage.setItem("aegis_settings_v1", serialized)

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
  } catch {
    // ignore
  }
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

function applySettingsSideEffects(settings: AppSettings): void {
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
  }).catch((err) => {
    console.warn("Failed to persist config to backend:", err)
  })
}

export async function hydrateBackendSettings(
  set: (updater: (state: WorkbenchStore) => Partial<WorkbenchStore>) => void,
): Promise<void> {
  try {
    const cfg = await fetchBackendConfig()
    if (!cfg) return
    set((state) => {
      const prev = state.settings
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

      const mergedSettings: AppSettings = {
        ...next,
        agent: { ...next.agent, ...agentPatch },
      }
      return {
        settings: mergedSettings,
        theme: mergedSettings.workbench.appearance.mode,
        themePalette: mergedSettings.workbench.appearance.palette,
      } as any
    })
  } catch {
    // ignore
  }
}

export const createSettingsSlice: SliceCreator<SettingsSlice> = (set, get) => {
  const initialSettings = loadStoredSettings()
  if (typeof window !== "undefined") {
    applyThemeToDom(
      initialSettings.workbench.appearance.palette,
      initialSettings.workbench.appearance.mode,
    )
    applyTypographyVariables(initialSettings)
    hydrateBackendSettings(set).catch((err) => {
      console.warn("Failed to hydrate backend settings:", err)
    })
  }

  return {
    settings: initialSettings,
    theme: initialSettings.workbench.appearance.mode,
    themePalette: initialSettings.workbench.appearance.palette,
    tabSize: initialSettings.editor.tabSize,
    minimapEnabled: initialSettings.editor.minimapEnabled,
    minimapScale: initialSettings.editor.minimapScale,
    linterSettings: initialSettings.linter,

    setSettings: (updater) => {
      set((state) => {
        const next =
          typeof updater === "function" ? updater(state.settings) : updater
        applySettingsSideEffects(next)
        return {
          settings: next,
          theme: next.workbench.appearance.mode,
          themePalette: next.workbench.appearance.palette,
          tabSize: next.editor.tabSize,
          minimapEnabled: next.editor.minimapEnabled,
          minimapScale: next.editor.minimapScale,
          linterSettings: next.linter,
        } as any
      })
    },

    updateEditorSettings: (patch) => {
      set((state) => {
        const updaterFn = patch as (prev: EditorSettings) => EditorSettings
        const updatedEditor =
          typeof patch === "function"
            ? updaterFn(state.settings.editor)
            : { ...state.settings.editor, ...patch }
        const next: AppSettings = {
          ...state.settings,
          editor: updatedEditor,
        }
        applySettingsSideEffects(next)
        return {
          settings: next,
          tabSize: updatedEditor.tabSize,
          minimapEnabled: updatedEditor.minimapEnabled,
          minimapScale: updatedEditor.minimapScale,
        } as any
      })
    },

    updateWorkbenchSettings: (updater) => {
      set((state) => {
        let nextWorkbench = state.settings.workbench
        if (typeof updater === "function") {
          const fn = updater as (prev: any) => any
          const combined = {
            ...state.settings.workbench.appearance,
            ...state.settings.workbench,
          }
          const result = fn(combined)
          if (result && "appearance" in result) {
            nextWorkbench = {
              ...state.settings.workbench,
              ...result,
              appearance: {
                ...state.settings.workbench.appearance,
                ...result.appearance,
              },
            }
          } else {
            nextWorkbench = {
              ...state.settings.workbench,
              appearance: {
                ...state.settings.workbench.appearance,
                ...result,
              },
            }
          }
        } else if (
          "palette" in updater ||
          "mode" in updater ||
          "fontSize" in updater ||
          "fontFamily" in updater ||
          "lineHeight" in updater
        ) {
          nextWorkbench = {
            ...state.settings.workbench,
            appearance: {
              ...state.settings.workbench.appearance,
              ...updater as Partial<WorkbenchAppearanceSettings>,
            },
          }
        } else {
          const wUpdate = updater as Partial<AppSettings["workbench"]>
          nextWorkbench = {
            ...state.settings.workbench,
            ...wUpdate,
            appearance: {
              ...state.settings.workbench.appearance,
              ...(wUpdate.appearance || {}),
            },
          }
        }

        const next: AppSettings = {
          ...state.settings,
          workbench: nextWorkbench,
        }
        applySettingsSideEffects(next)
        return {
          settings: next,
          theme: next.workbench.appearance.mode,
          themePalette: next.workbench.appearance.palette,
        } as any
      })
    },

    updateFilesSettings: (patch) => {
      set((state) => {
        const updaterFn = patch as (prev: FilesSettings) => FilesSettings
        const nextFiles =
          typeof patch === "function"
            ? updaterFn(state.settings.files)
            : { ...state.settings.files, ...patch }
        const next: AppSettings = {
          ...state.settings,
          files: nextFiles,
        }
        applySettingsSideEffects(next)
        return { settings: next } as any
      })
    },

    updateFeaturesSettings: (patch) => {
      set((state) => {
        const updaterFn = patch as (prev: FeaturesSettings) => FeaturesSettings
        const nextFeatures =
          typeof patch === "function"
            ? updaterFn(state.settings.features)
            : { ...state.settings.features, ...patch }
        const next: AppSettings = {
          ...state.settings,
          features: nextFeatures,
        }
        applySettingsSideEffects(next)
        return { settings: next } as any
      })
    },

    updateCompanionSettings: (patch) => {
      set((state) => {
        const updaterFn = patch as (
          prev: CompanionSettings,
        ) => CompanionSettings
        const nextCompanion =
          typeof patch === "function"
            ? updaterFn(state.settings.companion)
            : { ...state.settings.companion, ...patch }
        const next: AppSettings = {
          ...state.settings,
          companion: nextCompanion,
        }
        applySettingsSideEffects(next)
        return { settings: next } as any
      })
    },

    updateLinterSettings: (updater) => {
      set((state) => {
        const nextLinter =
          typeof updater === "function"
            ? updater(state.settings.linter)
            : { ...state.settings.linter, ...updater }
        const next: AppSettings = {
          ...state.settings,
          linter: nextLinter,
        }
        applySettingsSideEffects(next)
        return {
          settings: next,
          linterSettings: nextLinter,
        } as any
      })
    },

    updateAgentSettings: (patch) => {
      set((state) => {
        const updaterFn = patch as (prev: AgentSettings) => AgentSettings
        const nextAgent =
          typeof patch === "function"
            ? updaterFn(state.settings.agent)
            : { ...state.settings.agent, ...patch }
        const next: AppSettings = {
          ...state.settings,
          agent: nextAgent,
        }
        applySettingsSideEffects(next)
        return { settings: next } as any
      })
    },

    resetSettings: () => {
      const next = DEFAULT_APP_SETTINGS
      applySettingsSideEffects(next)
      set(() => ({
        settings: next,
        theme: next.workbench.appearance.mode,
        themePalette: next.workbench.appearance.palette,
        tabSize: next.editor.tabSize,
        minimapEnabled: next.editor.minimapEnabled,
        minimapScale: next.editor.minimapScale,
        linterSettings: next.linter,
      }))
    },

    setThemeMode: (mode: ThemeMode) => {
      set((state) => {
        const next: AppSettings = {
          ...state.settings,
          workbench: {
            ...state.settings.workbench,
            appearance: {
              ...state.settings.workbench.appearance,
              mode,
            },
          },
        }
        applySettingsSideEffects(next)
        return {
          settings: next,
          theme: mode,
        } as any
      })
    },

    setTheme: (mode: ThemeMode) => {
      get().setThemeMode(mode)
    },

    setThemePalette: (palette: ThemePaletteId) => {
      set((state) => {
        const next: AppSettings = {
          ...state.settings,
          workbench: {
            ...state.settings.workbench,
            appearance: {
              ...state.settings.workbench.appearance,
              palette,
            },
          },
        }
        applySettingsSideEffects(next)
        return {
          settings: next,
          themePalette: palette,
        } as any
      })
    },

    toggleThemeMode: () => {
      set((state) => {
        const currentMode = state.settings.workbench.appearance.mode
        const nextMode: ThemeMode = currentMode === "dark" ? "light" : "dark"
        const next: AppSettings = {
          ...state.settings,
          workbench: {
            ...state.settings.workbench,
            appearance: {
              ...state.settings.workbench.appearance,
              mode: nextMode,
            },
          },
        }
        applySettingsSideEffects(next)
        return {
          settings: next,
          theme: nextMode,
        } as any
      })
    },

    toggleTheme: () => {
      get().toggleThemeMode()
    },
  }
}

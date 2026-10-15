import { useEffect, useRef } from "react"
import { Terminal, type ITheme } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import { useWorkbenchStore, useShallow } from "../../../store"
import {
  resizeTerminalApi,
  sendTerminalInputApi,
} from "../../../utils/terminalApi"
import {
  getThemeDefinition,
  type ThemePaletteId,
  type ThemeMode,
} from "../../../themes/themeRegistry"
import { API_BASE } from "../../../utils/apiBase"

function getDynamicTerminalTheme(
  palette: ThemePaletteId = "default",
  mode: ThemeMode = "dark",
): ITheme {
  const themeDef = getThemeDefinition(palette, mode)
  const t = themeDef.tokens || {}
  const isLight = mode === "light"

  const get = (name: string, fallback: string) => {
    if (t[name]) return t[name]
    if (typeof window !== "undefined") {
      const val = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim()
      if (val && !val.startsWith("var(")) return val
    }
    return fallback
  }

  return {
    background: get("--color-canvas", isLight ? "#f6f8fb" : "#090d16"),
    foreground: get("--color-ink", isLight ? "#0f172a" : "#e7edf7"),
    cursor: get("--color-accent", isLight ? "#0284c7" : "#38bdf8"),
    cursorAccent: get("--color-canvas", isLight ? "#f6f8fb" : "#090d16"),
    selectionBackground: get(
      "--color-accent-soft",
      isLight ? "#0284c726" : "#38bdf826",
    ),
    selectionForeground: get("--color-ink", isLight ? "#0f172a" : "#e7edf7"),
    black: get("--color-surface-raised", isLight ? "#eef2f7" : "#1c2434"),
    red: get("--color-red", isLight ? "#dc2626" : "#f87171"),
    green: get("--color-green", isLight ? "#16a34a" : "#4ade80"),
    yellow: get("--color-orange", isLight ? "#d97706" : "#fb923c"),
    blue: get("--color-blue", isLight ? "#2563eb" : "#60a5fa"),
    magenta: get("--color-pink", isLight ? "#c026d3" : "#f472b6"),
    cyan: get("--color-cyan", isLight ? "#0891b2" : "#38bdf8"),
    white: get("--color-ink", isLight ? "#0f172a" : "#e7edf7"),
    brightBlack: get("--color-ink-muted", isLight ? "#64748b" : "#6f7d91"),
    brightRed: get("--color-red", isLight ? "#dc2626" : "#f87171"),
    brightGreen: get("--color-green", isLight ? "#16a34a" : "#4ade80"),
    brightYellow: get("--color-orange", isLight ? "#d97706" : "#fb923c"),
    brightBlue: get("--color-blue", isLight ? "#2563eb" : "#60a5fa"),
    brightMagenta: get("--color-pink", isLight ? "#c026d3" : "#f472b6"),
    brightCyan: get("--color-cyan", isLight ? "#0891b2" : "#38bdf8"),
    brightWhite: get("--color-ink", isLight ? "#0f172a" : "#e7edf7"),
  }
}

export function TerminalView() {
  const {
    sessionId,
    isLive,
    shell,
    setTerminalRunning,
    createTerminalSession,
    terminalSettings,
    theme,
    themePalette,
  } = useWorkbenchStore(
    useShallow((s) => ({
      sessionId: s.activeTerminalSession?.id,
      isLive: s.activeTerminalSession?.isLive ?? false,
      shell: s.activeTerminalSession?.shell || "zsh",
      setTerminalRunning: s.setTerminalRunning,
      createTerminalSession: s.createTerminalSession,
      terminalSettings: s.settings?.features?.terminal,
      theme: s.theme,
      themePalette: s.themePalette,
    })),
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const inputBufferRef = useRef<string>("")
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasAttemptedLiveUpgradeRef = useRef(false)

  // Auto-upgrade mock initial session to real backend PTY session (only once)
  useEffect(() => {
    if (hasAttemptedLiveUpgradeRef.current) return
    hasAttemptedLiveUpgradeRef.current = true
    if (sessionId && !isLive) {
      createTerminalSession(shell)
    }
  }, [sessionId, isLive, shell, createTerminalSession])

  // Synchronize terminal theme dynamically on theme or palette changes
  useEffect(() => {
    if (!termRef.current) return
    const updatedTheme = getDynamicTerminalTheme(themePalette, theme)
    termRef.current.options.theme = updatedTheme
  }, [theme, themePalette])

  const cursorBlinking = terminalSettings?.cursorBlinking ?? true
  const cursorStyle =
    terminalSettings?.cursorStyle === "line"
      ? "bar"
      : terminalSettings?.cursorStyle || "block"
  const fontSize = terminalSettings?.fontSize || 12
  const fontFamily =
    terminalSettings?.fontFamily ||
    "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Consolas, monospace"
  const lineHeight = terminalSettings?.lineHeight || 1.35

  useEffect(() => {
    if (!containerRef.current || !sessionId) return

    // 1. Instantiate Xterm with dynamically resolved Tailwind Token palette
    const term = new Terminal({
      cursorBlink: cursorBlinking,
      cursorStyle,
      fontSize,
      fontFamily,
      lineHeight,
      theme: getDynamicTerminalTheme(themePalette, theme),
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    containerRef.current.innerHTML = ""
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitAddonRef.current = fitAddon

    // 2. Synchronize dimensions
    let isConnected = false

    const syncSize = () => {
      try {
        if (
          !containerRef.current ||
          containerRef.current.clientWidth === 0 ||
          containerRef.current.clientHeight === 0
        ) {
          return
        }
        fitAddon.fit()
        if (term.cols && term.rows && isLive && isConnected) {
          void resizeTerminalApi(sessionId, term.cols, term.rows)
        }
      } catch {
        // Safe fallback
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      syncSize()
    })
    resizeObserver.observe(containerRef.current)

    // Initial resize sync after layout stabilizes
    setTimeout(syncSize, 100)

    // 3. Keystroke capture with micro-batching and serialized in-flight queue
    let sendPromiseChain: Promise<boolean> = Promise.resolve(true)

    const flushInput = () => {
      if (!isLive || !isConnected) {
        // Retain pending keystrokes until SSE connection handshake completes
        return
      }
      const pending = inputBufferRef.current
      if (!pending) return
      inputBufferRef.current = ""
      flushTimerRef.current = null

      sendPromiseChain = sendPromiseChain.then(() =>
        sendTerminalInputApi(sessionId, pending),
      )
    }

    const onDataDisposable = term.onData((data) => {
      inputBufferRef.current += data
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(flushInput, 5)
      }
    })

    // 4. SSE Downlink connection
    let sse: EventSource | null = null
    if (isLive) {
      sse = new EventSource(`${API_BASE}/api/v1/events/terminal/${sessionId}`)

      sse.addEventListener("connected", () => {
        isConnected = true
        setTerminalRunning(true)
        syncSize()
        flushInput()
      })

      sse.addEventListener("data", (event) => {
        try {
          const parsed = JSON.parse(event.data) as { payload?: string }
          if (parsed.payload) {
            const binary = atob(parsed.payload)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i)
            }
            term.write(bytes)
          }
        } catch {
          term.write(event.data)
        }
      })

      sse.addEventListener("exit", () => {
        isConnected = false
        setTerminalRunning(false)
        term.write("\r\n\x1b[90m[Process finished]\x1b[0m\r\n")
      })

      sse.onerror = () => {
        // SSE closed or severed; disconnect to avoid infinite retry loops if Go server is offline
        isConnected = false
        sse?.close()
        setTerminalRunning(false)
      }
    } else {
      // Mock / Offline session rendering fallback
      term.write(
        "\x1b[33m➜ Offline Terminal Session\x1b[0m\r\n" +
          "\x1b[90mGo Core Server is not running on http://localhost:8080.\x1b[0m\r\n" +
          "\x1b[90mTo start both Vite and Go server together, run:\x1b[0m\r\n" +
          "\x1b[36m  npm run dev:all\x1b[0m\r\n" +
          "\x1b[90mor in a separate terminal: \x1b[36mnpm run server\x1b[0m\r\n\r\n",
      )
    }

    const handleClearEvent = (e: Event) => {
      const custom = e as CustomEvent<{ sessionId?: string }>
      if (!custom.detail?.sessionId || custom.detail.sessionId === sessionId) {
        term.clear()
      }
    }

    const handleCopyEvent = () => {
      term.selectAll()
      const content = term.getSelection()
      term.clearSelection()
      if (content && typeof navigator !== "undefined" && navigator.clipboard) {
        void navigator.clipboard.writeText(content)
      }
    }

    window.addEventListener("aegis:terminal-clear", handleClearEvent)
    window.addEventListener("aegis:terminal-copy", handleCopyEvent)

    return () => {
      window.removeEventListener("aegis:terminal-clear", handleClearEvent)
      window.removeEventListener("aegis:terminal-copy", handleCopyEvent)
      resizeObserver.disconnect()
      onDataDisposable.dispose()
      term.dispose()
      if (sse) {
        sse.close()
      }
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
      }
    }
  }, [
    sessionId,
    isLive,
    cursorBlinking,
    cursorStyle,
    fontSize,
    fontFamily,
    lineHeight,
    setTerminalRunning,
  ])

  return (
    <div className="terminal-session">
      <div className="terminal-xterm-container" ref={containerRef} />
    </div>
  )
}

export default TerminalView

import { useEffect, useRef } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import { useWorkbench } from "../../../context/WorkbenchContext"
import {
  resizeTerminalApi,
  sendTerminalInputApi,
} from "../../../utils/terminalApi"

function getDynamicTerminalTheme() {
  if (typeof window === "undefined") {
    return {}
  }

  const cs = getComputedStyle(document.documentElement)
  const get = (name: string) =>
    cs.getPropertyValue(name).trim() || `var(${name})`

  return {
    background: get("--color-canvas"),
    foreground: get("--color-ink"),
    cursor: get("--color-accent"),
    cursorAccent: get("--color-canvas"),
    selectionBackground: get("--color-accent-soft"),
    selectionForeground: get("--color-ink"),
    black: get("--color-surface-raised"),
    red: get("--color-red"),
    green: get("--color-green"),
    yellow: get("--color-orange"),
    blue: get("--color-blue"),
    magenta: get("--color-pink"),
    cyan: get("--color-cyan"),
    white: get("--color-ink"),
    brightBlack: get("--color-ink-muted"),
    brightRed: get("--color-red"),
    brightGreen: get("--color-green"),
    brightYellow: get("--color-orange"),
    brightBlue: get("--color-blue"),
    brightMagenta: get("--color-pink"),
    brightCyan: get("--color-cyan"),
    brightWhite: get("--color-ink"),
  }
}

export function TerminalView() {
  const {
    activeTerminalSession,
    setTerminalRunning,
    createTerminalSession,
    settings,
  } = useWorkbench()

  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const inputBufferRef = useRef<string>("")
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sessionId = activeTerminalSession?.id
  const isLive = activeTerminalSession?.isLive ?? false
  const hasAttemptedLiveUpgradeRef = useRef(false)

  // Auto-upgrade mock initial session to real backend PTY session (only once)
  useEffect(() => {
    if (hasAttemptedLiveUpgradeRef.current) return
    hasAttemptedLiveUpgradeRef.current = true
    if (activeTerminalSession && !activeTerminalSession.isLive) {
      createTerminalSession(activeTerminalSession.shell || "zsh")
    }
  }, [activeTerminalSession, createTerminalSession])

  useEffect(() => {
    if (!containerRef.current || !sessionId) return

    // 1. Instantiate Xterm with dynamically resolved Tailwind Token palette
    const term = new Terminal({
      cursorBlink: settings?.features?.terminal?.cursorBlinking ?? true,
      cursorStyle:
        settings?.features?.terminal?.cursorStyle === "line"
          ? "bar"
          : settings?.features?.terminal?.cursorStyle || "block",
      fontSize: settings?.features?.terminal?.fontSize || 12,
      fontFamily:
        settings?.features?.terminal?.fontFamily ||
        "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Consolas, monospace",
      lineHeight: settings?.features?.terminal?.lineHeight || 1.35,
      theme: getDynamicTerminalTheme(),
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
      sse = new EventSource(`/api/v1/events/terminal/${sessionId}`)

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

    return () => {
      resizeObserver.disconnect()
      onDataDisposable.dispose()
      if (sse) {
        sse.close()
      }
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
      }
      term.dispose()
    }
  }, [sessionId, isLive, settings, setTerminalRunning])

  return (
    <div className="terminal-session">
      <div className="terminal-xterm-container" ref={containerRef} />
    </div>
  )
}

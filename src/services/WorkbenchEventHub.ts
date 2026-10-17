import { API_BASE, getSessionToken } from "../utils/apiBase"

export type EventHubHandler = (payload: any, type: string) => void

export interface EventEnvelope {
  channel: string
  type?: string
  payload?: any
  timestamp?: number
}

export class WorkbenchEventHub {
  private es: EventSource | null = null
  private handlers = new Map<string, Set<EventHubHandler>>()
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private baseReconnectDelay = 1000
  private maxReconnectDelay = 30000

  public connect(): void {
    if (this.es) return
    if (typeof window === "undefined" || typeof EventSource === "undefined")
      return

    try {
      const token = getSessionToken()
      const sseUrl = token
        ? `${API_BASE}/api/v1/events?token=${encodeURIComponent(token)}`
        : `${API_BASE}/api/v1/events`
      this.es = new EventSource(sseUrl)

      this.es.onopen = () => {
        this.reconnectAttempts = 0
      }

      this.es.addEventListener("message", (evt: MessageEvent) => {
        try {
          const envelope: EventEnvelope = JSON.parse(evt.data)
          if (!envelope || !envelope.channel) return
          const channelHandlers = this.handlers.get(envelope.channel)
          if (channelHandlers) {
            const payload =
              envelope.payload !== undefined ? envelope.payload : envelope
            const eventType = envelope.type || ""
            for (const handler of channelHandlers) {
              try {
                handler(payload, eventType)
              } catch (handlerErr) {
                console.error(
                  `Error in EventHub handler for channel "${envelope.channel}":`,
                  handlerErr,
                )
              }
            }
          }
        } catch {
          // Ignore JSON parse error on non-json keepalives
        }
      })

      this.es.addEventListener("connected", (evt: MessageEvent) => {
        let payload: any = { status: "connected" }
        try {
          if (evt.data) {
            payload = JSON.parse(evt.data)
          }
        } catch {
          // Default status payload
        }
        for (const [channel, handlers] of this.handlers.entries()) {
          for (const handler of handlers) {
            try {
              handler(payload, "connected")
            } catch (handlerErr) {
              console.error(
                `Error in EventHub connected handler for channel "${channel}":`,
                handlerErr,
              )
            }
          }
        }
      })

      this.es.onerror = () => {
        this.handleError()
      }
    } catch {
      // Safe fallback when server is unreachable or offline
      this.handleError()
    }
  }

  private handleError(): void {
    this.cleanupEventSource()
    const delay = Math.min(
      this.maxReconnectDelay,
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
    )
    this.reconnectAttempts++
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    this.reconnectTimer = setTimeout(() => {
      if (this.getTotalSubscriberCount() > 0) {
        this.connect()
      }
    }, delay)
  }

  public subscribe(channel: string, handler: EventHubHandler): () => void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set())
    }
    this.handlers.get(channel)!.add(handler)

    if (!this.es) {
      this.connect()
    }

    return () => {
      const set = this.handlers.get(channel)
      if (set) {
        set.delete(handler)
        if (set.size === 0) {
          this.handlers.delete(channel)
        }
      }
      if (this.getTotalSubscriberCount() === 0) {
        this.disconnect()
      }
    }
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.cleanupEventSource()
    this.reconnectAttempts = 0
  }

  private cleanupEventSource(): void {
    if (this.es) {
      this.es.onopen = null
      this.es.onerror = null
      this.es.onmessage = null
      this.es.close()
      this.es = null
    }
  }

  public getTotalSubscriberCount(): number {
    let count = 0
    for (const set of this.handlers.values()) {
      count += set.size
    }
    return count
  }

  public isConnected(): boolean {
    return this.es !== null && this.es.readyState === EventSource.OPEN
  }

  public publishLocal(channel: string, payload: any, type: string = ""): void {
    const channelHandlers = this.handlers.get(channel)
    if (channelHandlers) {
      for (const handler of channelHandlers) {
        try {
          handler(payload, type)
        } catch (err) {
          console.error(
            `Error in local EventHub handler for "${channel}":`,
            err,
          )
        }
      }
    }
  }
}

export const eventHub = new WorkbenchEventHub()

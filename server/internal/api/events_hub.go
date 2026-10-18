package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// HubEvent represents the standardized multiplexed event envelope.
type HubEvent struct {
	Channel   string      `json:"channel"`
	Type      string      `json:"type"`
	Payload   interface{} `json:"payload"`
	Timestamp int64       `json:"timestamp"`
}

// EventHub manages fan-out distribution of multiplexed events to active SSE client connections.
type EventHub struct {
	mu          sync.RWMutex
	subscribers map[chan HubEvent]struct{}
}

// NewEventHub creates and initializes a new EventHub instance.
func NewEventHub() *EventHub {
	return &EventHub{
		subscribers: make(map[chan HubEvent]struct{}),
	}
}

// Subscribe registers a new subscriber channel with a buffer.
// It returns the receive channel and an unsubscribe cleanup function.
func (h *EventHub) Subscribe() (chan HubEvent, func()) {
	ch := make(chan HubEvent, 128)
	h.mu.Lock()
	h.subscribers[ch] = struct{}{}
	h.mu.Unlock()

	unsub := func() {
		h.mu.Lock()
		delete(h.subscribers, ch)
		h.mu.Unlock()
	}

	return ch, unsub
}

// SubscriberCount returns the current number of registered subscribers.
func (h *EventHub) SubscriberCount() int {
	if h == nil {
		return 0
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subscribers)
}

// Publish broadcasts an event envelope across all registered subscribers in a non-blocking manner.
func (h *EventHub) Publish(channel, eventType string, payload interface{}) {
	if h == nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()

	evt := HubEvent{
		Channel:   channel,
		Type:      eventType,
		Payload:   payload,
		Timestamp: time.Now().UnixMilli(),
	}

	for ch := range h.subscribers {
		select {
		case ch <- evt:
		default:
			// Non-blocking drop protects publisher when client buffer is congested
		}
	}
}

// handleUnifiedEvents serves the multiplexed SSE endpoint GET /api/v1/events.
func (s *Server) handleUnifiedEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	if s.eventHub == nil {
		jsonError(w, http.StatusInternalServerError, "event hub not initialized")
		return
	}

	ch, unsub := s.eventHub.Subscribe()
	defer unsub()

	// Initial connected event handshake
	fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"connected\"}\n\n")
	flusher.Flush()

	// Keep-alive ping ticker every 15 seconds
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case evt, ok := <-ch:
			if !ok {
				return
			}
			data, err := json.Marshal(evt)
			if err == nil {
				fmt.Fprintf(w, "event: message\ndata: %s\n\n", string(data))
				flusher.Flush()
			}
		}
	}
}

// initEventHubBridges connects workspace changes, debug events, and LSP diagnostics to the unified event hub.
func (s *Server) initEventHubBridges() {
	if s.eventHub == nil {
		return
	}

	if s.ws != nil {
		wsCh, _ := s.ws.SubscribeEvents()
		go func() {
			for evt := range wsCh {
				if s.eventHub != nil {
					s.eventHub.Publish("workspace", "change", evt)
				}
			}
		}()
	}

	if s.debug != nil {
		dbgCh, _ := s.debug.Subscribe()
		go func() {
			for evt := range dbgCh {
				if s.eventHub != nil {
					s.eventHub.Publish("debug", evt.Type, evt)
				}
			}
		}()
	}

	if s.lsp != nil {
		lspCh, _ := s.lsp.SubscribeDiagnostics()
		go func() {
			for diag := range lspCh {
				if s.eventHub != nil {
					s.eventHub.Publish("lsp", "diagnostics", diag)
				}
			}
		}()
	}
}


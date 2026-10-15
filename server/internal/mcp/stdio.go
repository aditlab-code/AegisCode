package mcp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// RunStdio executes the MCP server over standard input/output streams,
// suitable for external MCP clients like Claude Desktop, Cursor, and OpenCode.
func RunStdio(ctx context.Context, srv *Server, in io.Reader, out io.Writer) error {
	// Guardrail: Ensure all standard logging goes to stderr so stdout remains
	// purely reserved for clean JSON-RPC protocol frames.
	log.SetOutput(os.Stderr)

	reader := bufio.NewReader(in)
	writer := bufio.NewWriter(out)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return fmt.Errorf("stdio read error: %w", err)
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Handle Content-Length framing if present (LSP/MCP hybrid)
		if strings.HasPrefix(line, "Content-Length:") {
			var length int
			_, _ = fmt.Sscanf(line, "Content-Length: %d", &length)
			// Read until blank line
			for {
				headerLine, hErr := reader.ReadString('\n')
				if hErr != nil {
					return hErr
				}
				if strings.TrimSpace(headerLine) == "" {
					break
				}
			}
			buf := make([]byte, length)
			if _, rErr := io.ReadFull(reader, buf); rErr != nil {
				return rErr
			}
			line = strings.TrimSpace(string(buf))
		}

		var req JSONRPCRequest
		if uErr := json.Unmarshal([]byte(line), &req); uErr != nil {
			resp := &JSONRPCResponse{
				JSONRPC: "2.0",
				Error: &JSONRPCError{
					Code:    CodeParseError,
					Message: fmt.Sprintf("invalid json: %v", uErr),
				},
			}
			respBytes, _ := json.Marshal(resp)
			_, _ = writer.Write(respBytes)
			_ = writer.WriteByte('\n')
			_ = writer.Flush()
			continue
		}

		if req.Method == "tools/call" {
			go notifyLocalEventBridge(req.Params)
		}

		resp := srv.HandleRequest(ctx, &req)
		if resp != nil {
			respBytes, mErr := json.Marshal(resp)
			if mErr != nil {
				resp = &JSONRPCResponse{
					JSONRPC: "2.0",
					ID:      req.ID,
					Error: &JSONRPCError{
						Code:    CodeInternalError,
						Message: fmt.Sprintf("failed to marshal response: %v", mErr),
					},
				}
				respBytes, _ = json.Marshal(resp)
			}
			_, _ = writer.Write(respBytes)
			_ = writer.WriteByte('\n')
			_ = writer.Flush()
		}
	}
}

// notifyLocalEventBridge informs the local running AegisCode Core Server if active on port 8080/8081.
func notifyLocalEventBridge(params json.RawMessage) {
	port := os.Getenv("AEGISCODE_PORT")
	if port == "" {
		port = "8080"
	}
	var callParams CallToolParams
	if err := json.Unmarshal(params, &callParams); err != nil {
		return
	}
	payload, _ := json.Marshal(map[string]any{
		"event":     "mcp_tool_invoked",
		"tool":      callParams.Name,
		"args":      callParams.Arguments,
		"timestamp": time.Now().Unix(),
	})
	client := &http.Client{Timeout: 300 * time.Millisecond}
	url := fmt.Sprintf("http://127.0.0.1:%s/api/v1/events/mcp", port)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
	if err == nil {
		req.Header.Set("Content-Type", "application/json")
		resp, doErr := client.Do(req)
		if doErr == nil {
			_ = resp.Body.Close()
		}
	}
}

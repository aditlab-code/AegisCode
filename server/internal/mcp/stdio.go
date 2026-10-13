package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
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

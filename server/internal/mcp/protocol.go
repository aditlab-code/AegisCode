package mcp

import "encoding/json"

// Standard JSON-RPC 2.0 error codes
const (
	CodeParseError     = -32700
	CodeInvalidRequest = -32600
	CodeMethodNotFound = -32601
	CodeInvalidParams  = -32602
	CodeInternalError  = -32603
)

// JSONRPCRequest represents an incoming JSON-RPC 2.0 request.
type JSONRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      any             `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// JSONRPCResponse represents an outgoing JSON-RPC 2.0 response.
type JSONRPCResponse struct {
	JSONRPC string        `json:"jsonrpc"`
	ID      any           `json:"id,omitempty"`
	Result  any           `json:"result,omitempty"`
	Error   *JSONRPCError `json:"error,omitempty"`
}

// JSONRPCError represents a standard JSON-RPC 2.0 error.
type JSONRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// ClientInfo describes the connected client during initialization.
type ClientInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// InitializeParams holds parameters sent with the "initialize" request.
type InitializeParams struct {
	ProtocolVersion string         `json:"protocolVersion"`
	Capabilities    map[string]any `json:"capabilities,omitempty"`
	ClientInfo      ClientInfo     `json:"clientInfo,omitempty"`
}

// ServerInfo describes this MCP server implementation.
type ServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// ToolsCapability indicates tool support.
type ToolsCapability struct {
	ListChanged bool `json:"listChanged"`
}

// RootsCapability indicates workspace roots support.
type RootsCapability struct {
	ListChanged bool `json:"listChanged"`
}

// ServerCapabilities defines server capabilities returned during initialization.
type ServerCapabilities struct {
	Tools *ToolsCapability `json:"tools,omitempty"`
	Roots *RootsCapability `json:"roots,omitempty"`
}

// InitializeResult is the payload returned for "initialize".
type InitializeResult struct {
	ProtocolVersion string             `json:"protocolVersion"`
	Capabilities    ServerCapabilities `json:"capabilities"`
	ServerInfo      ServerInfo         `json:"serverInfo"`
}

// PropertyDef defines a single JSON schema parameter property.
type PropertyDef struct {
	Type        string `json:"type"`
	Description string `json:"description"`
}

// ToolInputSchema describes JSON schema for tool arguments.
type ToolInputSchema struct {
	Type       string                 `json:"type"`
	Properties map[string]PropertyDef `json:"properties"`
	Required   []string               `json:"required,omitempty"`
}

// Tool represents a registered MCP tool.
type Tool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema ToolInputSchema `json:"inputSchema"`
}

// ListToolsResult is the payload returned for "tools/list".
type ListToolsResult struct {
	Tools []Tool `json:"tools"`
}

// CallToolParams holds arguments for "tools/call".
type CallToolParams struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments,omitempty"`
}

// ContentItem represents formatted content inside a tool call result.
type ContentItem struct {
	Type string `json:"type"` // "text"
	Text string `json:"text"`
}

// CallToolResult is the payload returned for "tools/call".
type CallToolResult struct {
	Content []ContentItem `json:"content"`
	IsError bool          `json:"isError,omitempty"`
}

// WorkspaceRoot represents a single filesystem root in the MCP protocol.
type WorkspaceRoot struct {
	URI  string `json:"uri"`
	Name string `json:"name,omitempty"`
}

// RootsListResult is the payload returned for "roots/list".
type RootsListResult struct {
	Roots []WorkspaceRoot `json:"roots"`
}

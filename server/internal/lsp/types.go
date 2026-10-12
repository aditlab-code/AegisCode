package lsp

import "encoding/json"

// JSON-RPC 2.0 base protocol structures

type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type Response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *ResponseError  `json:"error,omitempty"`
}

type ResponseError struct {
	Code    int64           `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

type Notification struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// LSP Core Domain Models

type Position struct {
	Line      int `json:"line"`      // 0-indexed in LSP standard
	Character int `json:"character"` // 0-indexed
}

type Range struct {
	Start Position `json:"start"`
	End   Position `json:"end"`
}

type Location struct {
	URI   string `json:"uri"`
	Range Range  `json:"range"`
}

type TextDocumentItem struct {
	URI        string `json:"uri"`
	LanguageID string `json:"languageId"`
	Version    int    `json:"version"`
	Text       string `json:"text"`
}

type TextDocumentIdentifier struct {
	URI string `json:"uri"`
}

type VersionedTextDocumentIdentifier struct {
	URI     string `json:"uri"`
	Version int    `json:"version"`
}

type TextDocumentContentChangeEvent struct {
	Text string `json:"text"`
}

type DidOpenTextDocumentParams struct {
	TextDocument TextDocumentItem `json:"textDocument"`
}

type DidChangeTextDocumentParams struct {
	TextDocument   VersionedTextDocumentIdentifier  `json:"textDocument"`
	ContentChanges []TextDocumentContentChangeEvent `json:"contentChanges"`
}

type CompletionParams struct {
	TextDocument PositionTextDocumentIdentifier `json:"textDocument"`
	Position     Position                       `json:"position"`
}

type PositionTextDocumentIdentifier struct {
	URI string `json:"uri"`
}

type CompletionItem struct {
	Label         string `json:"label"`
	Kind          int    `json:"kind,omitempty"`
	Detail        string `json:"detail,omitempty"`
	Documentation any    `json:"documentation,omitempty"`
	InsertText    string `json:"insertText,omitempty"`
}

type CompletionList struct {
	IsIncomplete bool             `json:"isIncomplete"`
	Items        []CompletionItem `json:"items"`
}

type HoverParams struct {
	TextDocument PositionTextDocumentIdentifier `json:"textDocument"`
	Position     Position                       `json:"position"`
}

type MarkupContent struct {
	Kind  string `json:"kind"` // "plaintext" | "markdown"
	Value string `json:"value"`
}

type Hover struct {
	Contents any    `json:"contents"`
	Range    *Range `json:"range,omitempty"`
}

type DefinitionParams struct {
	TextDocument PositionTextDocumentIdentifier `json:"textDocument"`
	Position     Position                       `json:"position"`
}

type Diagnostic struct {
	Range    Range  `json:"range"`
	Severity int    `json:"severity,omitempty"` // 1: Error, 2: Warning, 3: Info, 4: Hint
	Message  string `json:"message"`
	Source   string `json:"source,omitempty"`
}

type PublishDiagnosticsParams struct {
	URI         string       `json:"uri"`
	Diagnostics []Diagnostic `json:"diagnostics"`
}

// Initialize parameters
type InitializeParams struct {
	ProcessID    int                `json:"processId"`
	RootURI      string             `json:"rootUri"`
	Capabilities ClientCapabilities `json:"capabilities"`
}

type ClientCapabilities struct {
	TextDocument any `json:"textDocument,omitempty"`
	Workspace    any `json:"workspace,omitempty"`
}

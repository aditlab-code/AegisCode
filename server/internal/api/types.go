package api

import (
	"github.com/aditwicaksono/aegiscode/server/internal/git"
	"github.com/aditwicaksono/aegiscode/server/internal/lsp"
	"github.com/aditwicaksono/aegiscode/server/internal/workspace"
)

// WorkspaceInfoResponse models the current workspace metadata.
type WorkspaceInfoResponse struct {
	RootPath string `json:"rootPath"`
	Name     string `json:"name"`
}

// OpenWorkspaceRequest models the open folder request payload.
type OpenWorkspaceRequest struct {
	Path string `json:"path"`
}

// OpenWorkspaceResponse models the response when a workspace is opened.
type OpenWorkspaceResponse struct {
	Status   string `json:"status"`
	RootPath string `json:"rootPath"`
	Name     string `json:"name"`
}

// CloseWorkspaceResponse models the response when a workspace is closed.
type CloseWorkspaceResponse struct {
	Status string `json:"status"`
}

// PickFolderResponse models the native directory picker result.
type PickFolderResponse struct {
	Status      string `json:"status"`
	Path        string `json:"path,omitempty"`
	Name        string `json:"name,omitempty"`
	RootPath    string `json:"rootPath,omitempty"`
	Cancelled   bool   `json:"cancelled,omitempty"`
	Unsupported bool   `json:"unsupported,omitempty"`
	Error       string `json:"error,omitempty"`
}

// CreateFolderRequest models the folder creation payload.
type CreateFolderRequest struct {
	Path string `json:"path"`
}

// CreateFolderResponse models the folder creation response.
type CreateFolderResponse struct {
	Status string `json:"status"`
	Path   string `json:"path"`
}

// TreeResponse models the file hierarchy payload.
type TreeResponse struct {
	Tree []workspace.FileNode `json:"tree"`
}

// FileResponse models the file read response.
type FileResponse struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	IsLarge  bool   `json:"isLarge,omitempty"`
	IsBinary bool   `json:"isBinary,omitempty"`
	Size     int64  `json:"size,omitempty"`
}

// WriteFileRequest models the write file/folder request payload.
type WriteFileRequest struct {
	Path      string `json:"path"`
	Content   string `json:"content"`
	IsFolder  bool   `json:"isFolder"`
	Exclusive bool   `json:"exclusive,omitempty"`
}

// FileOperationResponse models file CRUD operation status.
type FileOperationResponse struct {
	Status          string `json:"status"`
	Path            string `json:"path,omitempty"`
	OldPath         string `json:"oldPath,omitempty"`
	NewPath         string `json:"newPath,omitempty"`
	SourcePath      string `json:"sourcePath,omitempty"`
	TargetDirectory string `json:"targetDirectory,omitempty"`
}

// RenameRequest models the rename request payload.
type RenameRequest struct {
	OldPath string `json:"oldPath"`
	NewPath string `json:"newPath"`
}

// MoveRequest models the file move payload.
type MoveRequest struct {
	SourcePath      string `json:"sourcePath"`
	TargetDirectory string `json:"targetDirectory"`
}

// SearchRequest models workspace text query parameters.
type SearchRequest struct {
	Query       string `json:"query"`
	IsRegex     bool   `json:"isRegex"`
	IsMatchCase bool   `json:"isMatchCase"`
	IsWholeWord bool   `json:"isWholeWord"`
}

// SearchResponse models workspace search results.
type SearchResponse struct {
	Results []workspace.SearchResult `json:"results"`
}

// ReplaceAllRequest models find and replace parameters.
type ReplaceAllRequest struct {
	Query       string `json:"query"`
	Replacement string `json:"replacement"`
	IsRegex     bool   `json:"isRegex"`
	IsMatchCase bool   `json:"isMatchCase"`
	IsWholeWord bool   `json:"isWholeWord"`
}

// ReplaceAllResponse models bulk replacement results.
type ReplaceAllResponse struct {
	Status        string   `json:"status"`
	Replacements  int      `json:"replacements"`
	ModifiedFiles []string `json:"modifiedFiles"`
}

// ErrorResponse models standard error messages.
type ErrorResponse struct {
	Error string `json:"error"`
}

// CheckoutBranchRequest models branch checkout payload.
type CheckoutBranchRequest struct {
	Branch string `json:"branch"`
}

// CreateBranchRequest models branch creation payload.
type CreateBranchRequest struct {
	Name     string `json:"name"`
	Checkout bool   `json:"checkout"`
}

// BranchesResponse models the branch listing payload.
type BranchesResponse struct {
	Branches []git.BranchInfo `json:"branches"`
}

// StageFilesRequest models staging files payload (accepts "files" or "paths").
type StageFilesRequest struct {
	Files []string `json:"files"`
	Paths []string `json:"paths,omitempty"`
	All   bool     `json:"all"`
}

// UnstageFilesRequest models unstaging files payload (accepts "files" or "paths").
type UnstageFilesRequest struct {
	Files []string `json:"files"`
	Paths []string `json:"paths,omitempty"`
	All   bool     `json:"all"`
}

// DiscardFilesRequest models discarding changes payload (accepts "files" or "paths").
type DiscardFilesRequest struct {
	Files []string `json:"files"`
	Paths []string `json:"paths,omitempty"`
	All   bool     `json:"all"`
}

// CommitRequest models commit payload.
type CommitRequest struct {
	Message   string `json:"message"`
	AutoStage bool   `json:"autoStage"`
}

// CommitResponse models commit result payload.
type CommitResponse struct {
	Status string          `json:"status"`
	Commit *git.CommitNode `json:"commit,omitempty"`
}

// PushRequest models push payload.
type PushRequest struct {
	SetUpstream bool `json:"setUpstream"`
}

// LogResponse models git commit log payload.
type LogResponse struct {
	Commits []git.CommitNode `json:"commits"`
}

// TimelineResponse models git timeline payload for a file.
type TimelineResponse struct {
	Commits []git.CommitNode `json:"commits"`
}

// TagsResponse models git tags payload.
type TagsResponse struct {
	Tags []string `json:"tags"`
}

// CreateTagRequest models tag creation payload.
type CreateTagRequest struct {
	Name    string `json:"name"`
	Message string `json:"message"`
}

// GitOperationResponse models standard Git operation response.
type GitOperationResponse struct {
	Status string `json:"status"`
}

// UnlockResponse models repository unlock outcome payload.
type UnlockResponse struct {
	Unlocked bool     `json:"unlocked"`
	Removed  []string `json:"removed"`
	Message  string   `json:"message,omitempty"`
}

// AddRemoteRequest models remote registration payload.
type AddRemoteRequest struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

// CreateTerminalRequest models the terminal creation request payload.
type CreateTerminalRequest struct {
	Shell string `json:"shell,omitempty"`
	Cwd   string `json:"cwd,omitempty"`
	Cols  uint16 `json:"cols,omitempty"`
	Rows  uint16 `json:"rows,omitempty"`
}

// CreateTerminalResponse models the terminal creation response payload.
type CreateTerminalResponse struct {
	SessionId string `json:"sessionId"`
	Shell     string `json:"shell"`
	Cwd       string `json:"cwd"`
	Pid       int    `json:"pid"`
}

// TerminalInputRequest models the terminal input payload.
type TerminalInputRequest struct {
	Data string `json:"data"`
}

// TerminalResizeRequest models terminal dimension updates.
type TerminalResizeRequest struct {
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// TerminalSessionInfo models active session metadata.
type TerminalSessionInfo struct {
	SessionId string `json:"sessionId"`
	Shell     string `json:"shell"`
	Cwd       string `json:"cwd"`
	Pid       int    `json:"pid"`
	Running   bool   `json:"running"`
}

// TerminalSessionsResponse models the list of active terminal sessions.
type TerminalSessionsResponse struct {
	Sessions []TerminalSessionInfo `json:"sessions"`
}

// LogEvent models a real-time log event for the output channel.
type LogEvent struct {
	Channel   string `json:"channel"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
	Level     string `json:"level,omitempty"`
}

// HandshakeRequest models the client authentication request.
type HandshakeRequest struct {
	ClientType   string `json:"clientType"`
	PairingToken string `json:"pairingToken"`
}

// HandshakeResponse models the token grant response.
type HandshakeResponse struct {
	SessionToken string `json:"sessionToken"`
	ExpiresIn    int64  `json:"expiresIn"`
	ExpiresAt    int64  `json:"expiresAt"`
}

// PairingInfoResponse models status and URL metadata for tablet companion pairing.
type PairingInfoResponse struct {
	LanIP        string `json:"lanIP"`
	Port         int    `json:"port"`
	PairingToken string `json:"pairingToken"`
	PairingURL   string `json:"pairingURL"`
	ExpiresIn    int64  `json:"expiresIn"`
	ExpiresAt    int64  `json:"expiresAt"`
}

// LSP API Request/Response Models (Core 2)

type LSPOpenRequest struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	Language string `json:"language"`
}

type LSPChangeRequest struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	Language string `json:"language"`
}

type LSPSaveRequest struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	Language string `json:"language"`
}

type LSPCloseRequest struct {
	Path     string `json:"path"`
	Language string `json:"language"`
}

type LSPSymbolsRequest struct {
	Path     string `json:"path"`
	Language string `json:"language"`
}

type LSPSymbolsResponse struct {
	Symbols []lsp.DocumentSymbol `json:"symbols"`
}

type LSPPositionRequest struct {
	Path      string `json:"path"`
	Line      int    `json:"line"`
	Character int    `json:"character"`
	Language  string `json:"language"`
}

type LSPCompletionResponse struct {
	Items []lsp.CompletionItem `json:"items"`
}

type LSPHoverResponse struct {
	Hover *lsp.Hover `json:"hover"`
}

type LSPDefinitionResponse struct {
	Locations []lsp.Location `json:"locations"`
}

type LSPFormattingRequest struct {
	Path         string `json:"path"`
	TabSize      int    `json:"tabSize"`
	InsertSpaces bool   `json:"insertSpaces"`
	Language     string `json:"language"`
}

type LSPFormattingResponse struct {
	Edits []lsp.TextEdit `json:"edits"`
}

type LSPStatusResponse struct {
	Servers []lsp.LanguageServerStatus `json:"servers"`
}

// CsvQueryResponse models the Big Data CSV query response.
type CsvQueryResponse = workspace.CsvQueryResult



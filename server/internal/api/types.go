package api

import "github.com/aditwicaksono/aegiscode/server/internal/workspace"

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
	Path    string `json:"path"`
	Content string `json:"content"`
}

// WriteFileRequest models the write file/folder request payload.
type WriteFileRequest struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	IsFolder bool   `json:"isFolder"`
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

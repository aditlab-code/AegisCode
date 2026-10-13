package codegraph

// Relation types for code_edges
const (
	RelCalls        = "calls"
	RelImports      = "imports"
	RelImplements   = "implements"
	RelExtends      = "extends"
	RelInstantiates = "instantiates"
	RelReferences   = "references"
)

// Symbol kind constants
const (
	KindFunction  = "function"
	KindMethod    = "method"
	KindClass     = "class"
	KindInterface = "interface"
	KindType      = "type"
	KindVariable  = "variable"
	KindConstant  = "constant"
)

// GraphFile represents a source file recorded in the graph_files table.
type GraphFile struct {
	ID        int64  `json:"id"`
	Path      string `json:"path"`
	Hash      string `json:"hash"`
	Language  string `json:"language"`
	Mtime     int64  `json:"mtime"`
	Size      int64  `json:"size"`
	IndexedAt int64  `json:"indexedAt"`
}

// CodeSymbol represents a symbol stored in the code_symbols table.
type CodeSymbol struct {
	ID         int64  `json:"id"`
	FileID     int64  `json:"fileId"`
	FilePath   string `json:"filePath,omitempty"`
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	Signature  string `json:"signature,omitempty"`
	Scope      string `json:"scope,omitempty"`
	DocComment string `json:"docComment,omitempty"`
	LineStart  int    `json:"lineStart"`
	LineEnd    int    `json:"lineEnd"`
	ColStart   int    `json:"colStart"`
	ColEnd     int    `json:"colEnd"`
}

// CodeEdge represents a relationship stored in the code_edges table.
type CodeEdge struct {
	ID             int64    `json:"id"`
	SourceSymbolID int64    `json:"sourceSymbolId"`
	TargetSymbolID *int64   `json:"targetSymbolId,omitempty"`
	TargetRawName  string   `json:"targetRawName,omitempty"`
	Relation       string   `json:"relation"`
	LineNumber     int      `json:"lineNumber"`
	Confidence     float64  `json:"confidence"`
}

// ExtractedSymbol is parsed from source AST prior to database storage.
type ExtractedSymbol struct {
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	Signature  string `json:"signature,omitempty"`
	Scope      string `json:"scope,omitempty"`
	DocComment string `json:"docComment,omitempty"`
	LineStart  int    `json:"lineStart"`
	LineEnd    int    `json:"lineEnd"`
	ColStart   int    `json:"colStart"`
	ColEnd     int    `json:"colEnd"`
}

// ExtractedEdge is an edge candidate connecting extracted symbols.
type ExtractedEdge struct {
	SourceSymbolIndex int     `json:"sourceSymbolIndex"`
	TargetRawName     string  `json:"targetRawName"`
	Relation          string  `json:"relation"`
	LineNumber        int     `json:"lineNumber"`
	Confidence        float64 `json:"confidence"`
}

// ExtractedFile is the result of AST parsing on a single source file.
type ExtractedFile struct {
	Path     string            `json:"path"`
	Language string            `json:"language"`
	Symbols  []ExtractedSymbol `json:"symbols"`
	Edges    []ExtractedEdge   `json:"edges"`
}

// SymbolOutline is a concise representation for Level 0 outline disclosure (< 150 tokens).
type SymbolOutline struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Signature string `json:"signature,omitempty"`
	LineStart int    `json:"lineStart"`
	LineEnd   int    `json:"lineEnd"`
}

// FileOutlineResult represents the output of GetFileOutline.
type FileOutlineResult struct {
	FilePath string          `json:"filePath"`
	Symbols  []SymbolOutline `json:"symbols"`
}

// SymbolDefinition represents the output of GetSymbolDefinition (< 80 tokens).
type SymbolDefinition struct {
	FilePath   string `json:"filePath"`
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	Signature  string `json:"signature,omitempty"`
	DocComment string `json:"docComment,omitempty"`
	LineStart  int    `json:"lineStart"`
	LineEnd    int    `json:"lineEnd"`
}

// CallerLocation represents an inbound caller location.
type CallerLocation struct {
	CallerName string `json:"callerName"`
	FilePath   string `json:"filePath"`
	LineNumber int    `json:"lineNumber"`
}

// FindCallersResult represents the output of FindCallers (Level 2).
type FindCallersResult struct {
	Callers   []CallerLocation `json:"callers"`
	Truncated bool             `json:"truncated"`
	Hint      string           `json:"hint,omitempty"`
}

// CalleeLocation represents an outbound callee location.
type CalleeLocation struct {
	CalleeName string `json:"calleeName"`
	FilePath   string `json:"filePath,omitempty"`
	LineNumber int    `json:"lineNumber"`
}

// FindCalleesResult represents the output of FindCallees (Level 2).
type FindCalleesResult struct {
	Callees   []CalleeLocation `json:"callee"`
	Truncated bool             `json:"truncated"`
	Hint      string           `json:"hint,omitempty"`
}

// SubgraphResult represents the output of QuerySubgraph (Level 3, < 400 tokens).
type SubgraphResult struct {
	RootSymbol string   `json:"rootSymbol"`
	Depth      int      `json:"depth"`
	Edges      []string `json:"edges"`
}

// DiffImpactResult represents the output of GetDiffImpact.
type DiffImpactResult struct {
	ChangedSymbols  []CodeSymbol     `json:"changedSymbols"`
	AffectedCallers []CallerLocation `json:"affectedCallers"`
}

// GraphStatus captures runtime indexing statistics for a workspace.
type GraphStatus struct {
	WorkspaceRoot string `json:"workspaceRoot"`
	WorkspaceHash string `json:"workspaceHash"`
	DBPath        string `json:"dbPath"`
	IndexedFiles  int    `json:"indexedFiles"`
	TotalFiles    int    `json:"totalFiles"`
	TotalSymbols  int    `json:"totalSymbols"`
	TotalEdges    int    `json:"totalEdges"`
	IsIndexing    bool   `json:"isIndexing"`
	LastIndexedAt int64  `json:"lastIndexedAt"`
}

package codegraph

// UIGraphNode represents an individual symbol node formatted for Cytoscape.js rendering.
type UIGraphNode struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`      // "function", "method", "interface", "class", "type"
	Signature string `json:"signature"`
	FilePath  string `json:"filePath"`
	LineStart int    `json:"lineStart"`
	LineEnd   int    `json:"lineEnd"`
	Doc       string `json:"doc,omitempty"`
	IsActive  bool   `json:"isActive"`
}

// UIGraphEdge represents a directed relationship between two symbol nodes.
type UIGraphEdge struct {
	ID       int64  `json:"id"`
	SourceID int64  `json:"sourceId"`
	TargetID int64  `json:"targetId"`
	Relation string `json:"relation"`  // "calls", "implements", "instantiates", "references"
	Line     int    `json:"line"`
}

// UIGraphPayload represents a complete visual graph payload sent to the frontend.
type UIGraphPayload struct {
	RootID    int64         `json:"rootId"`
	Nodes     []UIGraphNode `json:"nodes"`
	Edges     []UIGraphEdge `json:"edges"`
	Truncated bool          `json:"truncated"`
	Total     int           `json:"total"`
}

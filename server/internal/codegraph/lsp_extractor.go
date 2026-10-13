package codegraph

import (
	"strings"

	"github.com/aditwicaksono/aegiscode/server/internal/lsp"
)

// LSPExtractor enriches symbol extraction using an active LSP manager,
// falling back to native extractors when LSP is inactive or unavailable.
type LSPExtractor struct {
	lspMgr *lsp.Manager
	goExt  *GoExtractor
	tsExt  *TSExtractor
}

// NewLSPExtractor creates an extractor with LSP capability and local fallback extractors.
func NewLSPExtractor(lspMgr *lsp.Manager) *LSPExtractor {
	return &LSPExtractor{
		lspMgr: lspMgr,
		goExt:  NewGoExtractor(),
		tsExt:  NewTSExtractor(),
	}
}

// Extract extracts symbols from the file, attempting LSP DocumentSymbol first
// and falling back to native lexical/AST extractors.
func (e *LSPExtractor) Extract(relPath string, content []byte) (*ExtractedFile, error) {
	lang := detectLanguage(relPath)

	// Attempt LSP extraction if manager is provided
	if e.lspMgr != nil && lang != "" {
		docSymbols, err := e.lspMgr.DocumentSymbols(relPath, lang)
		if err == nil && len(docSymbols) > 0 {
			symbols := flattenDocumentSymbols(docSymbols, "")
			// LSP gives symbols, but we still need edges.
			// Use native extractor to get call edges and merge.
			var edges []ExtractedEdge
			if lang == "go" {
				if parsed, pErr := e.goExt.Extract(relPath, content); pErr == nil && parsed != nil {
					edges = parsed.Edges
				}
			} else if lang == "typescript" || lang == "javascript" {
				if parsed, pErr := e.tsExt.Extract(relPath, content); pErr == nil && parsed != nil {
					edges = parsed.Edges
				}
			}

			return &ExtractedFile{
				Path:     relPath,
				Language: lang,
				Symbols:  symbols,
				Edges:    edges,
			}, nil
		}
	}

	// Fallback to native extractors
	if lang == "go" {
		return e.goExt.Extract(relPath, content)
	}
	if lang == "typescript" || lang == "javascript" {
		return e.tsExt.Extract(relPath, content)
	}

	return &ExtractedFile{
		Path:     relPath,
		Language: lang,
		Symbols:  nil,
		Edges:    nil,
	}, nil
}

func detectLanguage(path string) string {
	lower := strings.ToLower(path)
	switch {
	case strings.HasSuffix(lower, ".go"):
		return "go"
	case strings.HasSuffix(lower, ".ts"), strings.HasSuffix(lower, ".tsx"):
		return "typescript"
	case strings.HasSuffix(lower, ".js"), strings.HasSuffix(lower, ".jsx"):
		return "javascript"
	case strings.HasSuffix(lower, ".py"):
		return "python"
	default:
		return ""
	}
}

func flattenDocumentSymbols(docSymbols []lsp.DocumentSymbol, parentScope string) []ExtractedSymbol {
	var out []ExtractedSymbol
	for _, ds := range docSymbols {
		kind := mapLSPSymbolKind(ds.Kind)
		sig := ds.Name
		if ds.Detail != "" {
			sig = ds.Detail
		}

		sym := ExtractedSymbol{
			Name:       ds.Name,
			Kind:       kind,
			Signature:  sig,
			Scope:      parentScope,
			DocComment: "",
			LineStart:  ds.Range.Start.Line + 1, // LSP is 0-indexed, CodeGraph is 1-indexed
			LineEnd:    ds.Range.End.Line + 1,
			ColStart:   ds.Range.Start.Character + 1,
			ColEnd:     ds.Range.End.Character + 1,
		}
		out = append(out, sym)

		if len(ds.Children) > 0 {
			scope := ds.Name
			if parentScope != "" {
				scope = parentScope + "." + ds.Name
			}
			children := flattenDocumentSymbols(ds.Children, scope)
			out = append(out, children...)
		}
	}
	return out
}

func mapLSPSymbolKind(k int) string {
	switch k {
	case 5, 23: // Class, Struct
		return KindClass
	case 11: // Interface
		return KindInterface
	case 6, 9: // Method, Constructor
		return KindMethod
	case 12: // Function
		return KindFunction
	case 13: // Variable
		return KindVariable
	case 14: // Constant
		return KindConstant
	case 10, 22, 26: // Enum, EnumMember, TypeParameter
		return KindType
	default:
		return KindFunction
	}
}

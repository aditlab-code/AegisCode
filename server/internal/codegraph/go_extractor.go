package codegraph

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
	"go/token"
	"strings"
)

// Extractor defines the interface for language-specific AST/symbol extractors.
type Extractor interface {
	Extract(relPath string, content []byte) (*ExtractedFile, error)
}

// GoExtractor extracts symbols and call edges from Go source code using standard go/ast.
type GoExtractor struct{}

// NewGoExtractor creates a new Go AST extractor.
func NewGoExtractor() *GoExtractor {
	return &GoExtractor{}
}

// Extract parses Go source code and extracts symbols and relation edges.
func (e *GoExtractor) Extract(relPath string, content []byte) (*ExtractedFile, error) {
	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, relPath, content, parser.ParseComments)
	if err != nil && node == nil {
		return nil, fmt.Errorf("failed to parse Go file %s: %w", relPath, err)
	}

	res := &ExtractedFile{
		Path:     relPath,
		Language: "go",
		Symbols:  make([]ExtractedSymbol, 0),
		Edges:    make([]ExtractedEdge, 0),
	}

	if node == nil {
		return res, nil
	}

	// Track imported packages as file-level references if needed
	var importSpecs []*ast.ImportSpec
	for _, imp := range node.Imports {
		importSpecs = append(importSpecs, imp)
	}

	// First pass: extract all symbols
	for _, decl := range node.Decls {
		switch d := decl.(type) {
		case *ast.FuncDecl:
			sym := e.extractFuncDecl(fset, d, content)
			symIndex := len(res.Symbols)
			res.Symbols = append(res.Symbols, sym)

			// Extract call edges from function body
			if d.Body != nil {
				edges := e.extractFuncEdges(fset, symIndex, d.Body)
				res.Edges = append(res.Edges, edges...)
			}

		case *ast.GenDecl:
			genSymbols := e.extractGenDecl(fset, d, content)
			res.Symbols = append(res.Symbols, genSymbols...)
		}
	}

	return res, nil
}

// extractFuncDecl extracts a function or method declaration.
func (e *GoExtractor) extractFuncDecl(fset *token.FileSet, fn *ast.FuncDecl, content []byte) ExtractedSymbol {
	startPos := fset.Position(fn.Pos())
	endPos := fset.Position(fn.End())

	kind := KindFunction
	scope := ""

	if fn.Recv != nil && len(fn.Recv.List) > 0 {
		kind = KindMethod
		recvType := e.exprToString(fset, fn.Recv.List[0].Type)
		scope = recvType
	}

	doc := ""
	if fn.Doc != nil {
		doc = strings.TrimSpace(fn.Doc.Text())
	}

	// Skeleton signature: extract up to opening brace of body
	sig := ""
	if fn.Body != nil {
		startOffset := startPos.Offset
		bodyOffset := fset.Position(fn.Body.Lbrace).Offset
		if startOffset >= 0 && bodyOffset <= len(content) && startOffset < bodyOffset {
			rawSig := string(content[startOffset:bodyOffset])
			sig = strings.TrimSpace(rawSig)
		}
	}

	if sig == "" {
		// Fallback formatting via printer
		var buf bytes.Buffer
		fnClone := *fn
		fnClone.Body = nil
		fnClone.Doc = nil
		_ = printer.Fprint(&buf, fset, &fnClone)
		sig = strings.TrimSpace(buf.String())
	}

	return ExtractedSymbol{
		Name:       fn.Name.Name,
		Kind:       kind,
		Signature:  sig,
		Scope:      scope,
		DocComment: doc,
		LineStart:  startPos.Line,
		LineEnd:    endPos.Line,
		ColStart:   startPos.Column,
		ColEnd:     endPos.Column,
	}
}

// extractGenDecl extracts TYPE, CONST, and VAR declarations.
func (e *GoExtractor) extractGenDecl(fset *token.FileSet, gen *ast.GenDecl, content []byte) []ExtractedSymbol {
	var symbols []ExtractedSymbol

	parentDoc := ""
	if gen.Doc != nil {
		parentDoc = strings.TrimSpace(gen.Doc.Text())
	}

	for _, spec := range gen.Specs {
		switch s := spec.(type) {
		case *ast.TypeSpec:
			kind := KindType
			switch s.Type.(type) {
			case *ast.StructType:
				kind = KindClass
			case *ast.InterfaceType:
				kind = KindInterface
			}

			startPos := fset.Position(s.Pos())
			endPos := fset.Position(s.End())

			doc := parentDoc
			if s.Doc != nil {
				doc = strings.TrimSpace(s.Doc.Text())
			}

			sig := fmt.Sprintf("type %s", s.Name.Name)
			if kind == KindClass {
				sig = fmt.Sprintf("type %s struct", s.Name.Name)
			} else if kind == KindInterface {
				sig = fmt.Sprintf("type %s interface", s.Name.Name)
			}

			symbols = append(symbols, ExtractedSymbol{
				Name:       s.Name.Name,
				Kind:       kind,
				Signature:  sig,
				DocComment: doc,
				LineStart:  startPos.Line,
				LineEnd:    endPos.Line,
				ColStart:   startPos.Column,
				ColEnd:     endPos.Column,
			})

		case *ast.ValueSpec:
			kind := KindVariable
			if gen.Tok == token.CONST {
				kind = KindConstant
			}

			doc := parentDoc
			if s.Doc != nil {
				doc = strings.TrimSpace(s.Doc.Text())
			}

			for _, name := range s.Names {
				startPos := fset.Position(name.Pos())
				endPos := fset.Position(name.End())

				sig := fmt.Sprintf("%s %s", gen.Tok.String(), name.Name)
				if s.Type != nil {
					sig = fmt.Sprintf("%s %s %s", gen.Tok.String(), name.Name, e.exprToString(fset, s.Type))
				}

				symbols = append(symbols, ExtractedSymbol{
					Name:       name.Name,
					Kind:       kind,
					Signature:  sig,
					DocComment: doc,
					LineStart:  startPos.Line,
					LineEnd:    endPos.Line,
					ColStart:   startPos.Column,
					ColEnd:     endPos.Column,
				})
			}
		}
	}

	return symbols
}

// extractFuncEdges inspects function body and extracts calls and instantiations.
func (e *GoExtractor) extractFuncEdges(fset *token.FileSet, sourceSymbolIndex int, body *ast.BlockStmt) []ExtractedEdge {
	var edges []ExtractedEdge
	seen := make(map[string]bool)

	ast.Inspect(body, func(n ast.Node) bool {
		if n == nil {
			return true
		}

		switch node := n.(type) {
		case *ast.CallExpr:
			targetName := ""
			switch fun := node.Fun.(type) {
			case *ast.Ident:
				targetName = fun.Name
			case *ast.SelectorExpr:
				targetName = fun.Sel.Name
			}

			if targetName != "" {
				line := fset.Position(node.Pos()).Line
				key := fmt.Sprintf("%s:%s", RelCalls, targetName)
				if !seen[key] {
					seen[key] = true
					edges = append(edges, ExtractedEdge{
						SourceSymbolIndex: sourceSymbolIndex,
						TargetRawName:     targetName,
						Relation:          RelCalls,
						LineNumber:        line,
						Confidence:        1.0,
					})
				}
			}

		case *ast.CompositeLit:
			targetName := ""
			switch t := node.Type.(type) {
			case *ast.Ident:
				targetName = t.Name
			case *ast.SelectorExpr:
				targetName = t.Sel.Name
			}

			if targetName != "" {
				line := fset.Position(node.Pos()).Line
				key := fmt.Sprintf("%s:%s", RelInstantiates, targetName)
				if !seen[key] {
					seen[key] = true
					edges = append(edges, ExtractedEdge{
						SourceSymbolIndex: sourceSymbolIndex,
						TargetRawName:     targetName,
						Relation:          RelInstantiates,
						LineNumber:        line,
						Confidence:        0.9,
					})
				}
			}
		}

		return true
	})

	return edges
}

// exprToString converts an ast.Expr to its string representation.
func (e *GoExtractor) exprToString(fset *token.FileSet, expr ast.Expr) string {
	if expr == nil {
		return ""
	}
	var buf bytes.Buffer
	_ = printer.Fprint(&buf, fset, expr)
	return strings.TrimSpace(buf.String())
}

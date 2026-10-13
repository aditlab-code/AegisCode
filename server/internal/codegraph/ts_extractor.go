package codegraph

import (
	"bytes"
	"regexp"
	"strings"
)

// TSExtractor extracts symbols and call edges from TypeScript and JavaScript files
// using pure-Go lexical parsing and regular expressions without external subprocesses.
type TSExtractor struct{}

// NewTSExtractor creates a new TypeScript/JavaScript lexical extractor.
func NewTSExtractor() *TSExtractor {
	return &TSExtractor{}
}

var (
	// regex for functions: (export )?(async )?function name(...)
	reFuncDecl = regexp.MustCompile(`(?m)^[ \t]*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*([a-zA-Z0-9_$]+)\s*(<[^>]*>)?\s*\(([^)]*)\)`)

	// regex for const/let/var arrow or function expressions: (export )?const name = (async )?(<...>)?(...) =>
	reArrowFunc = regexp.MustCompile(`(?m)^[ \t]*(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?(?:<[^>]*>)?\s*(?:\(([^)]*)\)|([a-zA-Z0-9_$]+))\s*=>`)

	// regex for class declarations: (export )?class name( extends X)?
	reClassDecl = regexp.MustCompile(`(?m)^[ \t]*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)`)

	// regex for interfaces: (export )?interface name
	reInterfaceDecl = regexp.MustCompile(`(?m)^[ \t]*(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)`)

	// regex for type aliases: (export )?type name =
	reTypeDecl = regexp.MustCompile(`(?m)^[ \t]*(?:export\s+)?type\s+([a-zA-Z0-9_$]+)\s*(?:<[^>]*>)?\s*=`)

	// regex for function calls inside bodies: identifier(...) or object.method(...)
	reCallExpr = regexp.MustCompile(`\b([a-zA-Z0-9_$]+)(?:\.([a-zA-Z0-9_$]+))?\s*\(`)
)

// Extract parses TS/JS source code and extracts symbols and relation edges.
func (e *TSExtractor) Extract(relPath string, content []byte) (*ExtractedFile, error) {
	lines := bytes.Split(content, []byte("\n"))
	lineOffsets := make([]int, len(lines))
	currOffset := 0
	for i, l := range lines {
		lineOffsets[i] = currOffset
		currOffset += len(l) + 1 // including \n
	}

	getLineCol := func(offset int) (int, int) {
		low, high := 0, len(lineOffsets)-1
		lineIdx := 0
		for low <= high {
			mid := (low + high) / 2
			if lineOffsets[mid] <= offset {
				lineIdx = mid
				low = mid + 1
			} else {
				high = mid - 1
			}
		}
		return lineIdx + 1, (offset - lineOffsets[lineIdx]) + 1
	}

	res := &ExtractedFile{
		Path:     relPath,
		Language: "typescript",
		Symbols:  make([]ExtractedSymbol, 0),
		Edges:    make([]ExtractedEdge, 0),
	}
	if strings.HasSuffix(relPath, ".js") || strings.HasSuffix(relPath, ".jsx") {
		res.Language = "javascript"
	}

	src := string(content)

	// Helper to extract doc comment preceding an offset
	extractPrecedingDoc := func(startOffset int) string {
		startLine, _ := getLineCol(startOffset)
		if startLine <= 1 {
			return ""
		}
		// Search lines above
		var docLines []string
		inBlock := false
		for l := startLine - 2; l >= 0; l-- {
			lineStr := strings.TrimSpace(string(lines[l]))
			if lineStr == "" && !inBlock {
				break
			}
			if strings.HasSuffix(lineStr, "*/") {
				inBlock = true
			}
			if inBlock {
				docLines = append([]string{lineStr}, docLines...)
				if strings.HasPrefix(lineStr, "/*") {
					break
				}
			} else if strings.HasPrefix(lineStr, "//") {
				clean := strings.TrimPrefix(lineStr, "//")
				docLines = append([]string{strings.TrimSpace(clean)}, docLines...)
			} else {
				break
			}
		}
		if len(docLines) == 0 {
			return ""
		}
		return strings.Join(docLines, "\n")
	}

	// Helper to find closing brace for a body
	findScopeEnd := func(openBraceOffset int) int {
		if openBraceOffset < 0 || openBraceOffset >= len(content) {
			return len(content)
		}
		depth := 0
		inString := byte(0)
		inLineComment := false
		inBlockComment := false

		for i := openBraceOffset; i < len(content); i++ {
			c := content[i]
			if inLineComment {
				if c == '\n' {
					inLineComment = false
				}
				continue
			}
			if inBlockComment {
				if c == '/' && i > 0 && content[i-1] == '*' {
					inBlockComment = false
				}
				continue
			}
			if inString != 0 {
				if c == inString && (i == 0 || content[i-1] != '\\') {
					inString = 0
				}
				continue
			}

			if c == '/' && i+1 < len(content) {
				if content[i+1] == '/' {
					inLineComment = true
					i++
					continue
				} else if content[i+1] == '*' {
					inBlockComment = true
					i++
					continue
				}
			}

			if c == '"' || c == '\'' || c == '`' {
				inString = c
				continue
			}

			if c == '{' {
				depth++
			} else if c == '}' {
				depth--
				if depth == 0 {
					return i
				}
			}
		}
		return len(content)
	}

	// 1. Function declarations
	matches := reFuncDecl.FindAllStringSubmatchIndex(src, -1)
	for _, m := range matches {
		name := src[m[2]:m[3]]
		fullMatchStart := m[0]
		lineStart, colStart := getLineCol(fullMatchStart)

		// Find opening brace after signature
		bodyStart := strings.Index(src[m[1]:], "{")
		lineEnd := lineStart
		colEnd := colStart
		var bodyContent string

		if bodyStart != -1 {
			openBrace := m[1] + bodyStart
			closeBrace := findScopeEnd(openBrace)
			lineEnd, colEnd = getLineCol(closeBrace)
			if openBrace < closeBrace && closeBrace <= len(src) {
				bodyContent = src[openBrace+1 : closeBrace]
			}
		}

		sig := strings.TrimSpace(src[fullMatchStart:m[1]])
		doc := extractPrecedingDoc(fullMatchStart)

		symIdx := len(res.Symbols)
		res.Symbols = append(res.Symbols, ExtractedSymbol{
			Name:       name,
			Kind:       KindFunction,
			Signature:  sig,
			DocComment: doc,
			LineStart:  lineStart,
			LineEnd:    lineEnd,
			ColStart:   colStart,
			ColEnd:     colEnd,
		})

		// Extract calls in function body
		if bodyContent != "" {
			edges := e.extractCallsFromBody(symIdx, bodyContent, lineStart)
			res.Edges = append(res.Edges, edges...)
		}
	}

	// 2. Arrow function expressions
	matchesArrow := reArrowFunc.FindAllStringSubmatchIndex(src, -1)
	for _, m := range matchesArrow {
		name := src[m[2]:m[3]]
		fullMatchStart := m[0]
		lineStart, colStart := getLineCol(fullMatchStart)

		bodyStart := strings.Index(src[m[1]:], "{")
		lineEnd := lineStart
		colEnd := colStart
		var bodyContent string

		if bodyStart != -1 {
			openBrace := m[1] + bodyStart
			closeBrace := findScopeEnd(openBrace)
			lineEnd, colEnd = getLineCol(closeBrace)
			if openBrace < closeBrace && closeBrace <= len(src) {
				bodyContent = src[openBrace+1 : closeBrace]
			}
		} else {
			// Single expression arrow function ending at newline or semicolon
			endIdx := strings.IndexAny(src[m[1]:], ";\n")
			if endIdx != -1 {
				lineEnd, colEnd = getLineCol(m[1] + endIdx)
				bodyContent = src[m[1] : m[1]+endIdx]
			}
		}

		sig := strings.TrimSpace(src[fullMatchStart:m[1]])
		doc := extractPrecedingDoc(fullMatchStart)

		symIdx := len(res.Symbols)
		res.Symbols = append(res.Symbols, ExtractedSymbol{
			Name:       name,
			Kind:       KindFunction,
			Signature:  sig,
			DocComment: doc,
			LineStart:  lineStart,
			LineEnd:    lineEnd,
			ColStart:   colStart,
			ColEnd:     colEnd,
		})

		if bodyContent != "" {
			edges := e.extractCallsFromBody(symIdx, bodyContent, lineStart)
			res.Edges = append(res.Edges, edges...)
		}
	}

	// 3. Classes
	matchesClass := reClassDecl.FindAllStringSubmatchIndex(src, -1)
	for _, m := range matchesClass {
		name := src[m[2]:m[3]]
		fullMatchStart := m[0]
		lineStart, colStart := getLineCol(fullMatchStart)

		bodyStart := strings.Index(src[m[1]:], "{")
		lineEnd := lineStart
		colEnd := colStart

		if bodyStart != -1 {
			openBrace := m[1] + bodyStart
			closeBrace := findScopeEnd(openBrace)
			lineEnd, colEnd = getLineCol(closeBrace)
		}

		sig := strings.TrimSpace(src[fullMatchStart:m[1]])
		doc := extractPrecedingDoc(fullMatchStart)

		res.Symbols = append(res.Symbols, ExtractedSymbol{
			Name:       name,
			Kind:       KindClass,
			Signature:  sig,
			DocComment: doc,
			LineStart:  lineStart,
			LineEnd:    lineEnd,
			ColStart:   colStart,
			ColEnd:     colEnd,
		})
	}

	// 4. Interfaces
	matchesInterface := reInterfaceDecl.FindAllStringSubmatchIndex(src, -1)
	for _, m := range matchesInterface {
		name := src[m[2]:m[3]]
		fullMatchStart := m[0]
		lineStart, colStart := getLineCol(fullMatchStart)

		bodyStart := strings.Index(src[m[1]:], "{")
		lineEnd := lineStart
		colEnd := colStart
		if bodyStart != -1 {
			openBrace := m[1] + bodyStart
			closeBrace := findScopeEnd(openBrace)
			lineEnd, colEnd = getLineCol(closeBrace)
		}

		sig := strings.TrimSpace(src[fullMatchStart:m[1]])
		doc := extractPrecedingDoc(fullMatchStart)

		res.Symbols = append(res.Symbols, ExtractedSymbol{
			Name:       name,
			Kind:       KindInterface,
			Signature:  sig,
			DocComment: doc,
			LineStart:  lineStart,
			LineEnd:    lineEnd,
			ColStart:   colStart,
			ColEnd:     colEnd,
		})
	}

	// 5. Types
	matchesType := reTypeDecl.FindAllStringSubmatchIndex(src, -1)
	for _, m := range matchesType {
		name := src[m[2]:m[3]]
		fullMatchStart := m[0]
		lineStart, colStart := getLineCol(fullMatchStart)

		endIdx := strings.IndexAny(src[m[1]:], ";\n")
		lineEnd := lineStart
		colEnd := colStart
		if endIdx != -1 {
			lineEnd, colEnd = getLineCol(m[1] + endIdx)
		}

		sig := strings.TrimSpace(src[fullMatchStart:m[1]])
		doc := extractPrecedingDoc(fullMatchStart)

		res.Symbols = append(res.Symbols, ExtractedSymbol{
			Name:       name,
			Kind:       KindType,
			Signature:  sig,
			DocComment: doc,
			LineStart:  lineStart,
			LineEnd:    lineEnd,
			ColStart:   colStart,
			ColEnd:     colEnd,
		})
	}

	return res, nil
}

// extractCallsFromBody scans function body for call expressions.
func (e *TSExtractor) extractCallsFromBody(sourceSymbolIndex int, body string, baseLine int) []ExtractedEdge {
	var edges []ExtractedEdge
	seen := make(map[string]bool)

	// Filter out common JS control keywords that look like function calls
	keywords := map[string]bool{
		"if": true, "for": true, "while": true, "switch": true,
		"catch": true, "require": true, "import": true, "typeof": true,
		"return": true, "void": true,
	}

	matches := reCallExpr.FindAllStringSubmatch(body, -1)
	for _, m := range matches {
		targetName := m[1]
		if m[2] != "" {
			targetName = m[2] // object.method() -> method
		}

		if keywords[targetName] || targetName == "" {
			continue
		}

		if !seen[targetName] {
			seen[targetName] = true
			edges = append(edges, ExtractedEdge{
				SourceSymbolIndex: sourceSymbolIndex,
				TargetRawName:     targetName,
				Relation:          RelCalls,
				LineNumber:        baseLine,
				Confidence:        0.9,
			})
		}
	}

	return edges
}

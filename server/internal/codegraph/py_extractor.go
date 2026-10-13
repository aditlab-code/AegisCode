package codegraph

import (
	"bytes"
	"regexp"
	"strings"
)

// PyExtractor extracts symbols and call edges from Python (.py) files
// using pure-Go lexical parsing and indentation tracking without external subprocesses.
type PyExtractor struct{}

// NewPyExtractor creates a new Python lexical extractor.
func NewPyExtractor() *PyExtractor {
	return &PyExtractor{}
}

var (
	// regex for Python function/method definitions: def name(args): or async def name(args):
	rePyFunc = regexp.MustCompile(`(?m)^([ \t]*)(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)`)

	// regex for Python class definitions: class Name(Bases):
	rePyClass = regexp.MustCompile(`(?m)^([ \t]*)class\s+([a-zA-Z0-9_]+)(?:\s*\(([^)]*)\))?`)

	// regex for function calls inside bodies: identifier(...) or object.method(...)
	rePyCall = regexp.MustCompile(`\b([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?\s*\(`)
)

var pyBuiltins = map[string]bool{
	"if": true, "for": true, "while": true, "with": true, "except": true, "def": true, "class": true,
	"return": true, "yield": true, "import": true, "from": true, "as": true, "pass": true,
	"print": true, "len": true, "range": true, "isinstance": true, "issubclass": true,
	"enumerate": true, "zip": true, "dict": true, "list": true, "set": true, "tuple": true,
	"str": true, "int": true, "float": true, "bool": true, "super": true, "open": true,
	"type": true, "repr": true, "hasattr": true, "getattr": true, "setattr": true,
}

// Extract parses Python source code and extracts symbols and relation edges.
func (e *PyExtractor) Extract(relPath string, content []byte) (*ExtractedFile, error) {
	lines := bytes.Split(content, []byte("\n"))
	lineOffsets := make([]int, len(lines))
	currOffset := 0
	for i, l := range lines {
		lineOffsets[i] = currOffset
		currOffset += len(l) + 1
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
		Language: "python",
		Symbols:  make([]ExtractedSymbol, 0),
		Edges:    make([]ExtractedEdge, 0),
	}

	src := string(content)

	// Helper to extract docstring immediately following a function or class definition
	extractDocstring := func(startLine int) string {
		if startLine >= len(lines) {
			return ""
		}
		// Search next 3 lines for docstring opener
		for l := startLine; l < len(lines) && l < startLine+3; l++ {
			trimmed := strings.TrimSpace(string(lines[l]))
			if trimmed == "" {
				continue
			}
			if strings.HasPrefix(trimmed, `"""`) || strings.HasPrefix(trimmed, `'''`) {
				delimiter := trimmed[:3]
				after := strings.TrimPrefix(trimmed, delimiter)
				if strings.Contains(after, delimiter) {
					// One-line docstring
					return strings.TrimSuffix(after, delimiter)
				}
				// Multi-line docstring
				var docLines []string
				docLines = append(docLines, after)
				for next := l + 1; next < len(lines); next++ {
					nStr := string(lines[next])
					if strings.Contains(nStr, delimiter) {
						docLines = append(docLines, strings.Split(nStr, delimiter)[0])
						break
					}
					docLines = append(docLines, nStr)
				}
				return strings.TrimSpace(strings.Join(docLines, "\n"))
			}
			break
		}
		return ""
	}

	// Helper to determine end line of a block by indentation
	determineEndLine := func(startLine int, baseIndent int) int {
		endLine := len(lines)
		for l := startLine; l < len(lines); l++ {
			lineStr := string(lines[l])
			trimmed := strings.TrimSpace(lineStr)
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			indent := len(lineStr) - len(strings.TrimLeft(lineStr, " \t"))
			if indent <= baseIndent {
				endLine = l
				break
			}
		}
		return endLine
	}

	type symbolCandidate struct {
		symbol     ExtractedSymbol
		startLine  int
		endLine    int
		baseIndent int
	}
	var candidates []symbolCandidate

	// 1. Extract Classes
	classMatches := rePyClass.FindAllStringSubmatchIndex(src, -1)
	for _, match := range classMatches {
		if len(match) < 6 {
			continue
		}
		indentStr := src[match[2]:match[3]]
		name := src[match[4]:match[5]]
		startLine, colStart := getLineCol(match[0])
		baseIndent := len(indentStr)
		endLine := determineEndLine(startLine, baseIndent)

		sig := "class " + name
		if match[6] != -1 && match[7] != -1 {
			sig += "(" + src[match[6]:match[7]] + ")"
		}

		doc := extractDocstring(startLine)

		candidates = append(candidates, symbolCandidate{
			symbol: ExtractedSymbol{
				Name:       name,
				Kind:       KindClass,
				Signature:  sig,
				Scope:      "",
				DocComment: doc,
				LineStart:  startLine,
				LineEnd:    endLine,
				ColStart:   colStart,
				ColEnd:     colStart + len(sig),
			},
			startLine:  startLine,
			endLine:    endLine,
			baseIndent: baseIndent,
		})
	}

	// 2. Extract Functions and Methods
	funcMatches := rePyFunc.FindAllStringSubmatchIndex(src, -1)
	for _, match := range funcMatches {
		if len(match) < 6 {
			continue
		}
		indentStr := src[match[2]:match[3]]
		name := src[match[4]:match[5]]
		args := ""
		if match[6] != -1 && match[7] != -1 {
			args = src[match[6]:match[7]]
		}

		startLine, colStart := getLineCol(match[0])
		baseIndent := len(indentStr)
		endLine := determineEndLine(startLine, baseIndent)

		kind := KindFunction
		scope := ""
		if baseIndent > 0 {
			kind = KindMethod
			// Find enclosing class if any
			for _, c := range candidates {
				if c.symbol.Kind == KindClass && startLine > c.startLine && startLine <= c.endLine && baseIndent > c.baseIndent {
					scope = c.symbol.Name
					break
				}
			}
		}

		sig := "def " + name + "(" + args + ")"
		doc := extractDocstring(startLine)

		candidates = append(candidates, symbolCandidate{
			symbol: ExtractedSymbol{
				Name:       name,
				Kind:       kind,
				Signature:  sig,
				Scope:      scope,
				DocComment: doc,
				LineStart:  startLine,
				LineEnd:    endLine,
				ColStart:   colStart,
				ColEnd:     colStart + len(sig),
			},
			startLine:  startLine,
			endLine:    endLine,
			baseIndent: baseIndent,
		})
	}

	for _, c := range candidates {
		res.Symbols = append(res.Symbols, c.symbol)
	}

	// 3. Extract Call Edges inside Function/Method bodies
	for symIdx, c := range candidates {
		if c.symbol.Kind != KindFunction && c.symbol.Kind != KindMethod {
			continue
		}

		// Body lines
		startIdx := c.startLine - 1
		endIdx := c.endLine
		if endIdx > len(lines) {
			endIdx = len(lines)
		}

		seenTarget := make(map[string]bool)

		for l := startIdx; l < endIdx; l++ {
			lineText := string(lines[l])
			trimmed := strings.TrimSpace(lineText)
			if strings.HasPrefix(trimmed, "#") {
				continue
			}

			matches := rePyCall.FindAllStringSubmatch(lineText, -1)
			for _, m := range matches {
				target := m[1]
				if m[2] != "" {
					target = m[2] // method name
				}

				if pyBuiltins[target] || target == c.symbol.Name || seenTarget[target] {
					continue
				}

				seenTarget[target] = true
				res.Edges = append(res.Edges, ExtractedEdge{
					SourceSymbolIndex: symIdx,
					TargetRawName:     target,
					Relation:          RelCalls,
					LineNumber:        l + 1,
					Confidence:        1.0,
				})
			}
		}
	}

	return res, nil
}

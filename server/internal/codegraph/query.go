package codegraph

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var (
	// reHunk matches unified diff hunk headers: @@ -10,5 +12,8 @@ or @@ -10 +12 @@
	reHunk = regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)
)

// QueryEngine executes progressive disclosure queries on the CodeGraph database.
type QueryEngine struct {
	db            *sql.DB
	workspaceRoot string
}

// NewQueryEngine creates a new query engine.
func NewQueryEngine(db *sql.DB, workspaceRoot string) *QueryEngine {
	return &QueryEngine{
		db:            db,
		workspaceRoot: workspaceRoot,
	}
}

// GetFileOutline retrieves a compact outline of all symbols in a file (Level 0, < 150 tokens).
func (q *QueryEngine) GetFileOutline(ctx context.Context, relPath string) (*FileOutlineResult, error) {
	relPath = strings.TrimSpace(relPath)
	if relPath == "" {
		return nil, fmt.Errorf("file path cannot be empty")
	}

	rows, err := q.db.QueryContext(ctx, `
		SELECT s.name, s.kind, coalesce(s.signature, ''), s.line_start, s.line_end
		FROM code_symbols s
		JOIN graph_files f ON s.file_id = f.id
		WHERE f.path = ?
		ORDER BY s.line_start ASC
	`, relPath)
	if err != nil {
		return nil, fmt.Errorf("failed to query file outline: %w", err)
	}
	defer rows.Close()

	res := &FileOutlineResult{
		FilePath: relPath,
		Symbols:  make([]SymbolOutline, 0),
	}

	for rows.Next() {
		var sym SymbolOutline
		if err := rows.Scan(&sym.Name, &sym.Kind, &sym.Signature, &sym.LineStart, &sym.LineEnd); err != nil {
			return nil, err
		}
		res.Symbols = append(res.Symbols, sym)
	}

	return res, nil
}

// GetSymbolDefinition retrieves definition, signature, and doc comments for a symbol (Level 1, < 80 tokens).
func (q *QueryEngine) GetSymbolDefinition(ctx context.Context, name, fileHint string) (*SymbolDefinition, error) {
	name = strings.TrimSpace(name)
	fileHint = strings.TrimSpace(fileHint)
	if name == "" {
		return nil, fmt.Errorf("symbol name cannot be empty")
	}

	row := q.db.QueryRowContext(ctx, `
		SELECT f.path, s.name, s.kind, coalesce(s.signature, ''), coalesce(s.doc_comment, ''), s.line_start, s.line_end
		FROM code_symbols s
		JOIN graph_files f ON s.file_id = f.id
		WHERE s.name = ? AND (? = '' OR f.path LIKE '%' || ? || '%')
		ORDER BY CASE WHEN f.path = ? THEN 0 ELSE 1 END, s.line_start ASC
		LIMIT 1
	`, name, fileHint, fileHint, fileHint)

	var def SymbolDefinition
	err := row.Scan(&def.FilePath, &def.Name, &def.Kind, &def.Signature, &def.DocComment, &def.LineStart, &def.LineEnd)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("symbol %q not found", name)
		}
		return nil, err
	}

	return &def, nil
}

// FindCallers locates inbound callers of a function with default LIMIT 15 and truncation hints (Level 2).
func (q *QueryEngine) FindCallers(ctx context.Context, functionName string, limit int) (*FindCallersResult, error) {
	functionName = strings.TrimSpace(functionName)
	if functionName == "" {
		return nil, fmt.Errorf("function name cannot be empty")
	}

	if limit <= 0 {
		limit = 15 // Default guardrail for high-fanout symbols
	}
	if limit > 100 {
		limit = 100
	}

	// 1. Count total callers to detect truncation
	var totalCallers int
	err := q.db.QueryRowContext(ctx, `
		SELECT count(DISTINCT s2.id || ':' || e.line_number)
		FROM code_edges e
		JOIN code_symbols s2 ON e.source_symbol_id = s2.id
		JOIN graph_files f2 ON s2.file_id = f2.id
		LEFT JOIN code_symbols s1 ON e.target_symbol_id = s1.id
		WHERE (e.target_raw_name = ? OR (s1.id IS NOT NULL AND s1.name = ?))
		  AND e.relation = 'calls'
	`, functionName, functionName).Scan(&totalCallers)
	if err != nil {
		return nil, fmt.Errorf("failed to count callers: %w", err)
	}

	// 2. Select callers up to limit
	rows, err := q.db.QueryContext(ctx, `
		SELECT DISTINCT s2.name, f2.path, e.line_number
		FROM code_edges e
		JOIN code_symbols s2 ON e.source_symbol_id = s2.id
		JOIN graph_files f2 ON s2.file_id = f2.id
		LEFT JOIN code_symbols s1 ON e.target_symbol_id = s1.id
		WHERE (e.target_raw_name = ? OR (s1.id IS NOT NULL AND s1.name = ?))
		  AND e.relation = 'calls'
		ORDER BY f2.path ASC, e.line_number ASC
		LIMIT ?
	`, functionName, functionName, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query callers: %w", err)
	}
	defer rows.Close()

	res := &FindCallersResult{
		Callers: make([]CallerLocation, 0),
	}

	for rows.Next() {
		var c CallerLocation
		if err := rows.Scan(&c.CallerName, &c.FilePath, &c.LineNumber); err != nil {
			return nil, err
		}
		res.Callers = append(res.Callers, c)
	}

	if totalCallers > len(res.Callers) {
		res.Truncated = true
		res.Hint = fmt.Sprintf("Showing %d of %d callers. Filter by file_path to narrow down.", len(res.Callers), totalCallers)
	}

	return res, nil
}

// FindCallees locates outbound function calls made from a function (Level 2).
func (q *QueryEngine) FindCallees(ctx context.Context, functionName, fileHint string, limit int) (*FindCalleesResult, error) {
	functionName = strings.TrimSpace(functionName)
	fileHint = strings.TrimSpace(fileHint)
	if functionName == "" {
		return nil, fmt.Errorf("function name cannot be empty")
	}

	if limit <= 0 {
		limit = 15
	}
	if limit > 100 {
		limit = 100
	}

	var totalCallees int
	err := q.db.QueryRowContext(ctx, `
		SELECT count(DISTINCT coalesce(s2.id, e.target_raw_name) || ':' || e.line_number)
		FROM code_symbols s1
		JOIN graph_files f1 ON s1.file_id = f1.id
		JOIN code_edges e ON e.source_symbol_id = s1.id
		LEFT JOIN code_symbols s2 ON e.target_symbol_id = s2.id
		WHERE s1.name = ? AND (? = '' OR f1.path LIKE '%' || ? || '%') AND e.relation = 'calls'
	`, functionName, fileHint, fileHint).Scan(&totalCallees)
	if err != nil {
		return nil, fmt.Errorf("failed to count callees: %w", err)
	}

	rows, err := q.db.QueryContext(ctx, `
		SELECT DISTINCT coalesce(s2.name, e.target_raw_name), coalesce(f2.path, ''), e.line_number
		FROM code_symbols s1
		JOIN graph_files f1 ON s1.file_id = f1.id
		JOIN code_edges e ON e.source_symbol_id = s1.id
		LEFT JOIN code_symbols s2 ON e.target_symbol_id = s2.id
		LEFT JOIN graph_files f2 ON s2.file_id = f2.id
		WHERE s1.name = ? AND (? = '' OR f1.path LIKE '%' || ? || '%') AND e.relation = 'calls'
		ORDER BY e.line_number ASC
		LIMIT ?
	`, functionName, fileHint, fileHint, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query callees: %w", err)
	}
	defer rows.Close()

	res := &FindCalleesResult{
		Callees: make([]CalleeLocation, 0),
	}

	for rows.Next() {
		var c CalleeLocation
		if err := rows.Scan(&c.CalleeName, &c.FilePath, &c.LineNumber); err != nil {
			return nil, err
		}
		res.Callees = append(res.Callees, c)
	}

	if totalCallees > len(res.Callees) {
		res.Truncated = true
		res.Hint = fmt.Sprintf("Showing %d of %d callees.", len(res.Callees), totalCallees)
	}

	return res, nil
}

// QuerySubgraph executes a capped 2-hop BFS around rootSymbol returning compact edge strings (Level 3, < 400 tokens).
func (q *QueryEngine) QuerySubgraph(ctx context.Context, rootSymbol string, depth int) (*SubgraphResult, error) {
	rootSymbol = strings.TrimSpace(rootSymbol)
	if rootSymbol == "" {
		return nil, fmt.Errorf("root symbol cannot be empty")
	}

	// Guardrail: Strictly clamp depth to max 2 hops
	if depth <= 0 {
		depth = 1
	}
	if depth > 2 {
		depth = 2
	}

	visitedSymbols := make(map[string]bool)
	visitedSymbols[rootSymbol] = true
	currentLevel := []string{rootSymbol}
	edgeSet := make(map[string]bool)
	var edgeList []string

	for hop := 1; hop <= depth; hop++ {
		var nextLevel []string
		for _, sym := range currentLevel {
			// 1. Outbound calls: sym -> calls -> target
			rowsOut, err := q.db.QueryContext(ctx, `
				SELECT DISTINCT s1.name, f1.path, e.relation, coalesce(s2.name, e.target_raw_name), coalesce(f2.path, ''), e.line_number
				FROM code_symbols s1
				JOIN graph_files f1 ON s1.file_id = f1.id
				JOIN code_edges e ON e.source_symbol_id = s1.id
				LEFT JOIN code_symbols s2 ON e.target_symbol_id = s2.id
				LEFT JOIN graph_files f2 ON s2.file_id = f2.id
				WHERE s1.name = ?
				LIMIT 20
			`, sym)
			if err == nil {
				for rowsOut.Next() {
					var sName, sPath, rel, tName, tPath string
					var lineNum int
					if err := rowsOut.Scan(&sName, &sPath, &rel, &tName, &tPath, &lineNum); err == nil {
						edgeStr := fmt.Sprintf("%s (%s) -> %s -> %s (%s:%d)", sName, sPath, rel, tName, tPath, lineNum)
						if !edgeSet[edgeStr] {
							edgeSet[edgeStr] = true
							edgeList = append(edgeList, edgeStr)
							if !visitedSymbols[tName] {
								visitedSymbols[tName] = true
								nextLevel = append(nextLevel, tName)
							}
						}
					}
				}
				rowsOut.Close()
			}

			// 2. Inbound calls: caller -> calls -> sym
			rowsIn, err := q.db.QueryContext(ctx, `
				SELECT DISTINCT s2.name, f2.path, e.relation, coalesce(s1.name, e.target_raw_name), coalesce(f1.path, ''), e.line_number
				FROM code_edges e
				JOIN code_symbols s2 ON e.source_symbol_id = s2.id
				JOIN graph_files f2 ON s2.file_id = f2.id
				LEFT JOIN code_symbols s1 ON e.target_symbol_id = s1.id
				LEFT JOIN graph_files f1 ON s1.file_id = f1.id
				WHERE (e.target_raw_name = ? OR (s1.id IS NOT NULL AND s1.name = ?))
				LIMIT 20
			`, sym, sym)
			if err == nil {
				for rowsIn.Next() {
					var sName, sPath, rel, tName, tPath string
					var lineNum int
					if err := rowsIn.Scan(&sName, &sPath, &rel, &tName, &tPath, &lineNum); err == nil {
						edgeStr := fmt.Sprintf("%s (%s) -> %s -> %s (%s:%d)", sName, sPath, rel, tName, tPath, lineNum)
						if !edgeSet[edgeStr] {
							edgeSet[edgeStr] = true
							edgeList = append(edgeList, edgeStr)
							if !visitedSymbols[sName] {
								visitedSymbols[sName] = true
								nextLevel = append(nextLevel, sName)
							}
						}
					}
				}
				rowsIn.Close()
			}
		}
		currentLevel = nextLevel
		if len(currentLevel) == 0 {
			break
		}
	}

	return &SubgraphResult{
		RootSymbol: rootSymbol,
		Depth:      depth,
		Edges:      edgeList,
	}, nil
}

// ReadSymbolBody retrieves the exact source body of a symbol from disk (Level 4).
func (q *QueryEngine) ReadSymbolBody(ctx context.Context, name, relPath string) (string, error) {
	name = strings.TrimSpace(name)
	relPath = strings.TrimSpace(relPath)
	if name == "" {
		return "", fmt.Errorf("symbol name cannot be empty")
	}

	row := q.db.QueryRowContext(ctx, `
		SELECT f.path, s.line_start, s.line_end
		FROM code_symbols s
		JOIN graph_files f ON s.file_id = f.id
		WHERE s.name = ? AND (? = '' OR f.path LIKE '%' || ? || '%')
		ORDER BY CASE WHEN f.path = ? THEN 0 ELSE 1 END, s.line_start ASC
		LIMIT 1
	`, name, relPath, relPath, relPath)

	var foundPath string
	var lineStart, lineEnd int
	err := row.Scan(&foundPath, &lineStart, &lineEnd)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("symbol %q not found", name)
		}
		return "", err
	}

	fullPath := filepath.Join(q.workspaceRoot, foundPath)
	file, err := os.Open(fullPath)
	if err != nil {
		return "", fmt.Errorf("failed to open source file %s: %w", foundPath, err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	var bodyLines []string
	currLine := 1

	for scanner.Scan() {
		if currLine >= lineStart && currLine <= lineEnd {
			bodyLines = append(bodyLines, scanner.Text())
		}
		if currLine > lineEnd {
			break
		}
		currLine++
	}

	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("failed reading lines from %s: %w", foundPath, err)
	}

	return strings.Join(bodyLines, "\n"), nil
}

// isIgnoredDiffPath returns true if a file path belongs to vendor, lockfile, or generated files.
func isIgnoredDiffPath(relPath string) bool {
	lower := strings.ToLower(relPath)
	parts := strings.Split(lower, "/")
	for _, p := range parts {
		if p == "node_modules" || p == "vendor" || p == "dist" || p == "build" || p == ".git" {
			return true
		}
	}
	base := filepath.Base(lower)
	if base == "package-lock.json" || base == "pnpm-lock.yaml" || base == "yarn.lock" ||
		base == "go.sum" || base == "cargo.lock" || base == "composer.lock" {
		return true
	}
	if strings.HasSuffix(lower, ".min.js") || strings.HasSuffix(lower, ".min.css") || strings.HasSuffix(lower, ".map") {
		return true
	}
	return false
}

// GetDiffImpact extracts modified lines from Git diff and maps them to affected symbols and their callers.
func (q *QueryEngine) GetDiffImpact(ctx context.Context, staged bool) (*DiffImpactResult, error) {
	if q.workspaceRoot == "" {
		return nil, fmt.Errorf("workspace root is empty")
	}

	args := []string{"diff", "--no-color", "-U0"}
	if staged {
		args = []string{"diff", "--cached", "--no-color", "-U0"}
	}

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = q.workspaceRoot
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git diff failed: %w", err)
	}

	// Parse diff output into modified ranges per file
	// diff --git a/path b/path
	fileRanges := make(map[string][][2]int)
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	currentFile := ""

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "diff --git ") {
			parts := strings.Fields(line)
			if len(parts) >= 4 {
				// b/path/to/file
				currentFile = strings.TrimPrefix(parts[3], "b/")
			}
			continue
		}

		if currentFile == "" || isIgnoredDiffPath(currentFile) {
			continue
		}

		if strings.HasPrefix(line, "@@ ") {
			match := reHunk.FindStringSubmatch(line)
			if len(match) >= 4 {
				newStart, _ := strconv.Atoi(match[3])
				newLen := 1
				if len(match) >= 5 && match[4] != "" {
					newLen, _ = strconv.Atoi(match[4])
				}
				endLine := newStart + newLen - 1
				if newLen == 0 {
					endLine = newStart
				}
				fileRanges[currentFile] = append(fileRanges[currentFile], [2]int{newStart, endLine})
			}
		}
	}

	var changedSymbols []CodeSymbol
	seenSymID := make(map[int64]bool)

	// Find symbols overlapping each range
	for path, ranges := range fileRanges {
		for _, r := range ranges {
			start, end := r[0], r[1]
			rows, err := q.db.QueryContext(ctx, `
				SELECT s.id, s.file_id, f.path, s.name, s.kind, coalesce(s.signature, ''), coalesce(s.scope, ''), coalesce(s.doc_comment, ''), s.line_start, s.line_end, s.col_start, s.col_end
				FROM code_symbols s
				JOIN graph_files f ON s.file_id = f.id
				WHERE f.path = ? AND s.line_start <= ? AND s.line_end >= ?
			`, path, end, start)
			if err != nil {
				continue
			}
			for rows.Next() {
				var sym CodeSymbol
				if err := rows.Scan(&sym.ID, &sym.FileID, &sym.FilePath, &sym.Name, &sym.Kind, &sym.Signature, &sym.Scope, &sym.DocComment, &sym.LineStart, &sym.LineEnd, &sym.ColStart, &sym.ColEnd); err == nil {
					if !seenSymID[sym.ID] {
						seenSymID[sym.ID] = true
						changedSymbols = append(changedSymbols, sym)
					}
				}
			}
			rows.Close()
		}
	}

	// For each changed symbol, find affected callers
	var affectedCallers []CallerLocation
	seenCaller := make(map[string]bool)

	for _, sym := range changedSymbols {
		callersRes, err := q.FindCallers(ctx, sym.Name, 10)
		if err == nil && callersRes != nil {
			for _, c := range callersRes.Callers {
				key := fmt.Sprintf("%s:%s:%d", c.CallerName, c.FilePath, c.LineNumber)
				if !seenCaller[key] {
					seenCaller[key] = true
					affectedCallers = append(affectedCallers, c)
				}
			}
		}
	}

	return &DiffImpactResult{
		ChangedSymbols:  changedSymbols,
		AffectedCallers: affectedCallers,
	}, nil
}

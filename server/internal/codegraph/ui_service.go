package codegraph

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
)

// UIService provides graph querying for visual studio rendering and MCP tab navigation.
type UIService struct {
	db            *sql.DB
	workspaceRoot string
}

// NewUIService creates a new UIService instance.
func NewUIService(db *sql.DB, workspaceRoot string) *UIService {
	return &UIService{
		db:            db,
		workspaceRoot: workspaceRoot,
	}
}

func (s *UIService) hasColbyNodes(ctx context.Context) bool {
	if s.db == nil {
		return false
	}
	var count int
	_ = s.db.QueryRowContext(ctx, `SELECT count(*) FROM sqlite_master WHERE type='table' AND name='nodes'`).Scan(&count)
	if count == 0 {
		return false
	}
	var nodeCount int
	_ = s.db.QueryRowContext(ctx, `SELECT count(*) FROM nodes`).Scan(&nodeCount)
	return nodeCount > 0
}

// GetSymbolNeighborhoodByTarget resolves target (name, symbol, or ID) and returns its neighborhood.
func (s *UIService) GetSymbolNeighborhoodByTarget(ctx context.Context, target string, depth int, limit int) (*UIGraphPayload, error) {
	if s.db == nil {
		return &UIGraphPayload{
			Nodes: make([]UIGraphNode, 0),
			Edges: make([]UIGraphEdge, 0),
		}, nil
	}

	clean := strings.TrimSpace(target)
	if clean == "" {
		return &UIGraphPayload{
			Nodes: make([]UIGraphNode, 0),
			Edges: make([]UIGraphEdge, 0),
		}, nil
	}

	if depth <= 0 {
		depth = 1
	} else if depth > 2 {
		depth = 2
	}
	if limit <= 0 {
		limit = 50
	} else if limit > 100 {
		limit = 100
	}

	if s.hasColbyNodes(ctx) {
		tokens := strings.Fields(clean)
		var rootID string
		for _, tok := range tokens {
			var candidate string
			err := s.db.QueryRowContext(ctx, `
				SELECT id FROM nodes
				WHERE id = ? OR name = ? OR qualified_name = ? OR file_path = ? OR name LIKE ?
				ORDER BY CASE WHEN id = ? THEN 0 WHEN name = ? THEN 1 ELSE 2 END
				LIMIT 1
			`, tok, tok, tok, tok, "%"+tok+"%", tok, tok).Scan(&candidate)
			if err == nil && candidate != "" {
				rootID = candidate
				break
			}
		}
		if rootID == "" {
			return &UIGraphPayload{
				Nodes: make([]UIGraphNode, 0),
				Edges: make([]UIGraphEdge, 0),
			}, nil
		}

		query := `
			WITH RECURSIVE neighborhood(node_id, current_depth) AS (
				SELECT ? AS node_id, 0 AS current_depth
				UNION
				SELECT
					CASE WHEN e.source = n.node_id THEN e.target ELSE e.source END,
					n.current_depth + 1
				FROM neighborhood n
				JOIN edges e ON (e.source = n.node_id OR e.target = n.node_id)
				WHERE n.current_depth < ?
			)
			SELECT DISTINCT node_id FROM neighborhood;
		`
		rows, err := s.db.QueryContext(ctx, query, rootID, depth)
		if err != nil {
			return nil, fmt.Errorf("colby neighborhood CTE failed: %w", err)
		}
		defer rows.Close()

		var nodeIDs []string
		nodeIDs = append(nodeIDs, rootID)
		seen := map[string]bool{rootID: true}
		for rows.Next() {
			var nid string
			if err := rows.Scan(&nid); err == nil && !seen[nid] {
				seen[nid] = true
				nodeIDs = append(nodeIDs, nid)
			}
		}

		truncated := false
		if len(nodeIDs) > limit {
			truncated = true
			nodeIDs = nodeIDs[:limit]
		}

		placeholders := make([]string, len(nodeIDs))
		args := make([]interface{}, len(nodeIDs))
		for i, id := range nodeIDs {
			placeholders[i] = "?"
			args[i] = id
		}

		nodeRows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
			SELECT id, name, kind, coalesce(signature, ''), file_path, start_line, end_line, coalesce(docstring, '')
			FROM nodes
			WHERE id IN (%s)
		`, strings.Join(placeholders, ",")), args...)
		if err != nil {
			return nil, fmt.Errorf("colby fetch nodes failed: %w", err)
		}
		defer nodeRows.Close()

		var nodes []UIGraphNode
		validNodeMap := make(map[string]bool)
		for nodeRows.Next() {
			var n UIGraphNode
			if err := nodeRows.Scan(&n.ID, &n.Name, &n.Kind, &n.Signature, &n.FilePath, &n.LineStart, &n.LineEnd, &n.Doc); err == nil {
				idStr := fmt.Sprintf("%v", n.ID)
				n.IsActive = (idStr == rootID)
				nodes = append(nodes, n)
				validNodeMap[idStr] = true
			}
		}

		var edges []UIGraphEdge
		if len(validNodeMap) > 0 {
			edgeArgs := make([]interface{}, len(nodeIDs)*2)
			for i, id := range nodeIDs {
				edgeArgs[i] = id
				edgeArgs[len(nodeIDs)+i] = id
			}
			edgeRows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
				SELECT id, source, target, kind, line
				FROM edges
				WHERE source IN (%s) AND target IN (%s)
				LIMIT 250
			`, strings.Join(placeholders, ","), strings.Join(placeholders, ",")), edgeArgs...)
			if err == nil {
				defer edgeRows.Close()
				for edgeRows.Next() {
					var e UIGraphEdge
					if err := edgeRows.Scan(&e.ID, &e.SourceID, &e.TargetID, &e.Relation, &e.Line); err == nil {
						if validNodeMap[fmt.Sprintf("%v", e.SourceID)] && validNodeMap[fmt.Sprintf("%v", e.TargetID)] {
							edges = append(edges, e)
						}
					}
				}
			}
		}

		return &UIGraphPayload{
			RootID:    rootID,
			Nodes:     nodes,
			Edges:     edges,
			Truncated: truncated,
			Total:     len(nodeIDs),
		}, nil
	}

	symID, err := strconv.ParseInt(clean, 10, 64)
	if err != nil {
		symID, err = s.ResolveSymbolID(ctx, clean)
		if err != nil {
			return &UIGraphPayload{
				Nodes: make([]UIGraphNode, 0),
				Edges: make([]UIGraphEdge, 0),
			}, nil
		}
	}
	return s.GetSymbolNeighborhood(ctx, symID, depth, limit)
}

// ResolveSymbolID resolves a symbol name (or file-qualified symbol) to its integer primary key.
func (s *UIService) ResolveSymbolID(ctx context.Context, symbolName string) (int64, error) {
	if s.db == nil {
		return 0, fmt.Errorf("codegraph database is not initialized")
	}
	clean := strings.TrimSpace(symbolName)
	if clean == "" {
		return 0, fmt.Errorf("symbol name cannot be empty")
	}
	var id int64
	err := s.db.QueryRowContext(ctx, `
		SELECT s.id
		FROM code_symbols s
		JOIN graph_files f ON s.file_id = f.id
		WHERE s.name = ? OR f.path = ?
		ORDER BY CASE WHEN s.name = ? THEN 0 ELSE 1 END, s.line_start ASC
		LIMIT 1
	`, clean, clean, clean).Scan(&id)
	if err != nil {
		return 0, err
	}
	return id, nil
}

// GetSymbolNeighborhood executes a recursive CTE up to 2 hops around symbolID and
// returns all connected nodes and edges formatted for Cytoscape.js.
func (s *UIService) GetSymbolNeighborhood(ctx context.Context, symbolID int64, depth int, limit int) (*UIGraphPayload, error) {
	if s.db == nil {
		return &UIGraphPayload{
			RootID: symbolID,
			Nodes:  make([]UIGraphNode, 0),
			Edges:  make([]UIGraphEdge, 0),
		}, nil
	}

	// Clamp depth: strictly 1 or 2 hops
	if depth <= 0 {
		depth = 1
	} else if depth > 2 {
		depth = 2
	}

	// Clamp limit: default 50, max 100
	if limit <= 0 {
		limit = 50
	} else if limit > 100 {
		limit = 100
	}

	// Check if root symbol exists
	var rootExists int
	err := s.db.QueryRowContext(ctx, `SELECT 1 FROM code_symbols WHERE id = ?`, symbolID).Scan(&rootExists)
	if err != nil {
		if err == sql.ErrNoRows {
			return &UIGraphPayload{
				RootID: symbolID,
				Nodes:  make([]UIGraphNode, 0),
				Edges:  make([]UIGraphEdge, 0),
			}, nil
		}
		return nil, fmt.Errorf("failed to verify root symbol %d: %w", symbolID, err)
	}

	// Recursive CTE to traverse up to `depth` hops
	query := `
		WITH RECURSIVE neighborhood(node_id, current_depth) AS (
			SELECT ? AS node_id, 0 AS current_depth
			UNION
			SELECT 
				CASE WHEN e.source_symbol_id = n.node_id THEN e.target_symbol_id ELSE e.source_symbol_id END,
				n.current_depth + 1
			FROM neighborhood n
			JOIN code_edges e ON (e.source_symbol_id = n.node_id OR e.target_symbol_id = n.node_id)
			WHERE n.current_depth < ?
			  AND (
				(e.source_symbol_id = n.node_id AND e.target_symbol_id IS NOT NULL)
				OR
				(e.target_symbol_id = n.node_id AND e.source_symbol_id IS NOT NULL)
			  )
		)
		SELECT DISTINCT node_id FROM neighborhood;
	`

	rows, err := s.db.QueryContext(ctx, query, symbolID, depth)
	if err != nil {
		return nil, fmt.Errorf("neighborhood query failed: %w", err)
	}
	defer rows.Close()

	var allNodeIDs []int64
	// Ensure root symbol is first in the list
	allNodeIDs = append(allNodeIDs, symbolID)
	seen := map[int64]bool{symbolID: true}

	for rows.Next() {
		var nid int64
		if err := rows.Scan(&nid); err == nil && !seen[nid] {
			seen[nid] = true
			allNodeIDs = append(allNodeIDs, nid)
		}
	}

	total := len(allNodeIDs)
	truncated := false
	if total > limit {
		truncated = true
		allNodeIDs = allNodeIDs[:limit]
	}

	nodes, nodeMap, err := s.fetchNodesByIDs(ctx, allNodeIDs, symbolID)
	if err != nil {
		return nil, err
	}

	edges, err := s.fetchEdgesBetweenNodes(ctx, nodeMap)
	if err != nil {
		return nil, err
	}

	return &UIGraphPayload{
		RootID:    symbolID,
		Nodes:     nodes,
		Edges:     edges,
		Truncated: truncated,
		Total:     total,
	}, nil
}

// GetActiveFileGraph retrieves all symbols defined within relPath and their connecting edges.
func (s *UIService) GetActiveFileGraph(ctx context.Context, relPath string) (*UIGraphPayload, error) {
	if s.db == nil {
		return &UIGraphPayload{
			Nodes: make([]UIGraphNode, 0),
			Edges: make([]UIGraphEdge, 0),
		}, nil
	}

	relPath = strings.TrimSpace(relPath)
	if relPath == "" {
		return &UIGraphPayload{
			Nodes: make([]UIGraphNode, 0),
			Edges: make([]UIGraphEdge, 0),
		}, nil
	}

	cleanRel := filepath.ToSlash(filepath.Clean(relPath))
	baseName := filepath.Base(cleanRel)

	if s.hasColbyNodes(ctx) {
		fileRows, err := s.db.QueryContext(ctx, `
			SELECT id, name, kind, coalesce(signature, ''), file_path, start_line, end_line, coalesce(docstring, '')
			FROM nodes
			WHERE (file_path = ? OR file_path = ? OR file_path LIKE ? OR ? LIKE '%' || file_path OR file_path LIKE ?)
			ORDER BY start_line ASC
		`, relPath, cleanRel, "%"+cleanRel, cleanRel, "%"+baseName)
		if err != nil {
			return nil, fmt.Errorf("failed to query colby file symbols: %w", err)
		}
		defer fileRows.Close()

		var nodes []UIGraphNode
		nodeMap := make(map[string]bool)
		var fileNodeIDs []string

		for fileRows.Next() {
			var n UIGraphNode
			if err := fileRows.Scan(&n.ID, &n.Name, &n.Kind, &n.Signature, &n.FilePath, &n.LineStart, &n.LineEnd, &n.Doc); err == nil {
				idStr := fmt.Sprintf("%v", n.ID)
				nodes = append(nodes, n)
				nodeMap[idStr] = true
				fileNodeIDs = append(fileNodeIDs, idStr)
			}
		}

		if len(fileNodeIDs) == 0 {
			return &UIGraphPayload{
				Nodes: make([]UIGraphNode, 0),
				Edges: make([]UIGraphEdge, 0),
			}, nil
		}

		placeholders := make([]string, len(fileNodeIDs))
		args := make([]interface{}, len(fileNodeIDs)*2)
		for i, id := range fileNodeIDs {
			placeholders[i] = "?"
			args[i] = id
			args[len(fileNodeIDs)+i] = id
		}
		inList := strings.Join(placeholders, ",")

		edgeQuery := fmt.Sprintf(`
			SELECT id, source, target, kind, line
			FROM edges
			WHERE (source IN (%s) OR target IN (%s))
			LIMIT 150
		`, inList, inList)

		edgeRows, err := s.db.QueryContext(ctx, edgeQuery, args...)
		if err != nil {
			return nil, fmt.Errorf("failed to query colby file edges: %w", err)
		}
		defer edgeRows.Close()

		var edges []UIGraphEdge
		for edgeRows.Next() {
			var e UIGraphEdge
			if err := edgeRows.Scan(&e.ID, &e.SourceID, &e.TargetID, &e.Relation, &e.Line); err == nil {
				edges = append(edges, e)
			}
		}

		return &UIGraphPayload{
			Nodes: nodes,
			Edges: edges,
			Total: len(nodes),
		}, nil
	}

	// 1. Fetch all symbols in this file
	fileRows, err := s.db.QueryContext(ctx, `
		SELECT s.id, s.name, s.kind, coalesce(s.signature, ''), f.path, s.line_start, s.line_end, coalesce(s.doc_comment, '')
		FROM code_symbols s
		JOIN graph_files f ON s.file_id = f.id
		WHERE (f.path = ? OR f.path = ? OR f.path LIKE ? OR ? LIKE '%' || f.path OR f.path LIKE ?)
		ORDER BY s.line_start ASC
	`, relPath, cleanRel, "%"+cleanRel, cleanRel, "%"+baseName)
	if err != nil {
		return nil, fmt.Errorf("failed to query file symbols: %w", err)
	}
	defer fileRows.Close()

	var nodes []UIGraphNode
	nodeMap := make(map[int64]bool)
	var fileSymbolIDs []int64

	for fileRows.Next() {
		var n UIGraphNode
		var id int64
		if err := fileRows.Scan(&id, &n.Name, &n.Kind, &n.Signature, &n.FilePath, &n.LineStart, &n.LineEnd, &n.Doc); err == nil {
			n.ID = id
			nodes = append(nodes, n)
			nodeMap[id] = true
			fileSymbolIDs = append(fileSymbolIDs, id)
		}
	}

	if len(fileSymbolIDs) == 0 {
		return &UIGraphPayload{
			Nodes: make([]UIGraphNode, 0),
			Edges: make([]UIGraphEdge, 0),
		}, nil
	}

	// 2. Fetch edges where source OR target is in the file's symbols
	placeholders := make([]string, len(fileSymbolIDs))
	args := make([]interface{}, len(fileSymbolIDs)*2)
	for i, id := range fileSymbolIDs {
		placeholders[i] = "?"
		args[i] = id
		args[len(fileSymbolIDs)+i] = id
	}
	inList := strings.Join(placeholders, ",")

	edgeQuery := fmt.Sprintf(`
		SELECT id, source_symbol_id, coalesce(target_symbol_id, 0), relation, line_number
		FROM code_edges
		WHERE (source_symbol_id IN (%s) OR target_symbol_id IN (%s))
		  AND target_symbol_id IS NOT NULL
		LIMIT 150
	`, inList, inList)

	edgeRows, err := s.db.QueryContext(ctx, edgeQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query file edges: %w", err)
	}
	defer edgeRows.Close()

	type rawEdge struct {
		id       int64
		src      int64
		tgt      int64
		relation string
		line     int
	}
	var rawEdges []rawEdge
	var externalIDs []int64
	externalSeen := make(map[int64]bool)

	for edgeRows.Next() {
		var re rawEdge
		if err := edgeRows.Scan(&re.id, &re.src, &re.tgt, &re.relation, &re.line); err == nil && re.tgt != 0 {
			rawEdges = append(rawEdges, re)
			if !nodeMap[re.src] && !externalSeen[re.src] {
				externalSeen[re.src] = true
				externalIDs = append(externalIDs, re.src)
			}
			if !nodeMap[re.tgt] && !externalSeen[re.tgt] {
				externalSeen[re.tgt] = true
				externalIDs = append(externalIDs, re.tgt)
			}
		}
	}

	// Add external neighbor nodes up to a cap of 50 total nodes
	maxNeighbors := 50 - len(nodes)
	if maxNeighbors > 0 && len(externalIDs) > 0 {
		if len(externalIDs) > maxNeighbors {
			externalIDs = externalIDs[:maxNeighbors]
		}
		extNodes, extMap, err := s.fetchNodesByIDs(ctx, externalIDs, 0)
		if err == nil {
			nodes = append(nodes, extNodes...)
			for id := range extMap {
				nodeMap[id] = true
			}
		}
	}

	// Filter edges to only those where both endpoints are in nodeMap
	var edges []UIGraphEdge
	for _, re := range rawEdges {
		if nodeMap[re.src] && nodeMap[re.tgt] {
			edges = append(edges, UIGraphEdge{
				ID:       re.id,
				SourceID: re.src,
				TargetID: re.tgt,
				Relation: re.relation,
				Line:     re.line,
			})
		}
	}

	var rootID any
	if len(nodes) > 0 {
		rootID = nodes[0].ID
	}

	return &UIGraphPayload{
		RootID: rootID,
		Nodes:  nodes,
		Edges:  edges,
		Total:  len(nodes),
	}, nil
}

// GetWorkspaceGraph retrieves top central symbols and primary structural relationships across the workspace.
func (s *UIService) GetWorkspaceGraph(ctx context.Context, limit int) (*UIGraphPayload, error) {
	if s.db == nil {
		return &UIGraphPayload{
			Nodes: make([]UIGraphNode, 0),
			Edges: make([]UIGraphEdge, 0),
		}, nil
	}

	if limit <= 0 {
		limit = 50
	} else if limit > 1000 {
		limit = 1000
	}

	if s.hasColbyNodes(ctx) {
		rows, err := s.db.QueryContext(ctx, `
			SELECT id, name, kind, coalesce(signature, ''), file_path, start_line, end_line, coalesce(docstring, '')
			FROM nodes
			ORDER BY is_exported DESC, length(docstring) DESC, id ASC
			LIMIT ?
		`, limit)
		if err != nil {
			return nil, fmt.Errorf("failed to query colby workspace nodes: %w", err)
		}
		defer rows.Close()

		var nodes []UIGraphNode
		nodeMap := make(map[string]bool)
		for rows.Next() {
			var n UIGraphNode
			if err := rows.Scan(&n.ID, &n.Name, &n.Kind, &n.Signature, &n.FilePath, &n.LineStart, &n.LineEnd, &n.Doc); err == nil {
				nodes = append(nodes, n)
				nodeMap[fmt.Sprintf("%v", n.ID)] = true
			}
		}

		var edges []UIGraphEdge
		if len(nodes) > 0 {
			edgeRows, err := s.db.QueryContext(ctx, `SELECT id, source, target, kind, line FROM edges LIMIT 350`)
			if err == nil {
				defer edgeRows.Close()
				for edgeRows.Next() {
					var e UIGraphEdge
					if err := edgeRows.Scan(&e.ID, &e.SourceID, &e.TargetID, &e.Relation, &e.Line); err == nil {
						if nodeMap[fmt.Sprintf("%v", e.SourceID)] && nodeMap[fmt.Sprintf("%v", e.TargetID)] {
							edges = append(edges, e)
						}
					}
				}
			}
		}

		return &UIGraphPayload{
			Nodes: nodes,
			Edges: edges,
			Total: len(nodes),
		}, nil
	}

	var totalSymbols int
	_ = s.db.QueryRowContext(ctx, `SELECT count(*) FROM code_symbols`).Scan(&totalSymbols)

	if totalSymbols == 0 {
		return &UIGraphPayload{
			Nodes: make([]UIGraphNode, 0),
			Edges: make([]UIGraphEdge, 0),
		}, nil
	}

	// Allocate balanced quota between functions and structural types (interfaces, classes, structs, types)
	// to prevent function calls from starving out key architectural types in the macro view.
	var structTotal int
	_ = s.db.QueryRowContext(ctx, `SELECT count(*) FROM code_symbols WHERE kind IN ('class', 'interface', 'struct', 'type')`).Scan(&structTotal)

	funcLimit := (limit * 3) / 5
	structLimit := limit - funcLimit
	if structTotal < structLimit {
		structLimit = structTotal
		funcLimit = limit - structLimit
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id FROM (
			SELECT s.id, count(e.id) as deg
			FROM code_symbols s
			JOIN graph_files f ON s.file_id = f.id
			LEFT JOIN code_edges e ON (e.source_symbol_id = s.id OR e.target_symbol_id = s.id)
			WHERE s.kind IN ('function', 'method')
			  AND f.path NOT LIKE '%.venv%' AND f.path NOT LIKE '%/venv/%' AND f.path NOT LIKE '%/site-packages/%' AND f.path NOT LIKE '%/__pycache__/%'
			GROUP BY s.id
			ORDER BY count(e.id) DESC, s.id ASC
			LIMIT ?
		)
		UNION ALL
		SELECT id FROM (
			SELECT s.id, count(e.id) as deg
			FROM code_symbols s
			JOIN graph_files f ON s.file_id = f.id
			LEFT JOIN code_edges e ON (e.source_symbol_id = s.id OR e.target_symbol_id = s.id)
			WHERE s.kind IN ('class', 'interface', 'struct', 'type')
			  AND f.path NOT LIKE '%.venv%' AND f.path NOT LIKE '%/venv/%' AND f.path NOT LIKE '%/site-packages/%' AND f.path NOT LIKE '%/__pycache__/%'
			GROUP BY s.id
			ORDER BY count(e.id) DESC, s.id ASC
			LIMIT ?
		)
	`, funcLimit, structLimit)
	if err != nil {
		return nil, fmt.Errorf("failed to query workspace top symbols: %w", err)
	}
	defer rows.Close()

	var nodeIDs []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err == nil {
			nodeIDs = append(nodeIDs, id)
		}
	}

	nodes, nodeMap, err := s.fetchNodesByIDs(ctx, nodeIDs, 0)
	if err != nil {
		return nil, err
	}

	edges, err := s.fetchEdgesBetweenNodes(ctx, nodeMap)
	if err != nil {
		return nil, err
	}

	var rootID any
	if len(nodes) > 0 {
		rootID = nodes[0].ID
	}

	return &UIGraphPayload{
		RootID:    rootID,
		Nodes:     nodes,
		Edges:     edges,
		Truncated: totalSymbols > limit,
		Total:     totalSymbols,
	}, nil
}

// SearchSymbols queries symbol_fts with fallback to LIKE for fast search autocomplete.
func (s *UIService) SearchSymbols(ctx context.Context, query string, limit int) ([]UIGraphNode, error) {
	if s.db == nil {
		return make([]UIGraphNode, 0), nil
	}

	query = strings.TrimSpace(query)
	if query == "" {
		return make([]UIGraphNode, 0), nil
	}

	if limit <= 0 {
		limit = 20
	} else if limit > 50 {
		limit = 50
	}

	if s.hasColbyNodes(ctx) {
		rows, err := s.db.QueryContext(ctx, `
			SELECT id, name, kind, coalesce(signature, ''), file_path, start_line, end_line, coalesce(docstring, '')
			FROM nodes
			WHERE name LIKE ? OR qualified_name LIKE ? OR file_path LIKE ?
			ORDER BY CASE WHEN name = ? THEN 0 WHEN qualified_name = ? THEN 1 ELSE 2 END, start_line ASC
			LIMIT ?
		`, "%"+query+"%", "%"+query+"%", "%"+query+"%", query, query, limit)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		var nodes []UIGraphNode
		for rows.Next() {
			var n UIGraphNode
			if err := rows.Scan(&n.ID, &n.Name, &n.Kind, &n.Signature, &n.FilePath, &n.LineStart, &n.LineEnd, &n.Doc); err == nil {
				nodes = append(nodes, n)
			}
		}
		return nodes, nil
	}

	var matchIDs []int64

	// 1. Try FTS5 MATCH with sanitized tokens
	var ftsTokens []string
	for _, tok := range strings.Fields(query) {
		cleanTok := strings.Trim(strings.ReplaceAll(tok, `"`, ""), "*?:;,.-_()[]{}!&|/'\\")
		if cleanTok != "" {
			ftsTokens = append(ftsTokens, fmt.Sprintf(`"%s"*`, cleanTok))
		}
	}
	ftsQuery := strings.Join(ftsTokens, " ")
	var rows *sql.Rows
	var err error
	if ftsQuery != "" {
		rows, err = s.db.QueryContext(ctx, `
			SELECT rowid FROM symbol_fts
			WHERE symbol_fts MATCH ?
			ORDER BY rank
			LIMIT ?
		`, ftsQuery, limit)
	} else {
		err = fmt.Errorf("empty fts query")
	}

	if err == nil {
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err == nil {
				matchIDs = append(matchIDs, id)
			}
		}
		rows.Close()
	}

	// 2. If FTS yielded nothing or failed, fallback to LIKE on code_symbols & graph_files
	if len(matchIDs) == 0 {
		cleanQ := filepath.ToSlash(filepath.Clean(query))
		baseQ := filepath.Base(cleanQ)
		baseNoExt := strings.TrimSuffix(baseQ, filepath.Ext(baseQ))

		likePattern := "%" + query + "%"
		likeClean := "%" + cleanQ + "%"
		likeBase := "%" + baseNoExt + "%"
		likeBaseFile := "%" + baseQ + "%"

		likeRows, err := s.db.QueryContext(ctx, `
			SELECT s.id
			FROM code_symbols s
			JOIN graph_files f ON s.file_id = f.id
			WHERE (s.name LIKE ? OR s.name LIKE ? OR f.path LIKE ? OR f.path LIKE ? OR ? LIKE '%' || f.path)
			  AND f.path NOT LIKE '%.venv%'
			  AND f.path NOT LIKE '%/venv/%'
			  AND f.path NOT LIKE '%/site-packages/%'
			  AND f.path NOT LIKE '%/__pycache__/%'
			ORDER BY s.line_start ASC
			LIMIT ?
		`, likePattern, likeBase, likeClean, likeBaseFile, cleanQ, limit)
		if err == nil {
			for likeRows.Next() {
				var id int64
				if err := likeRows.Scan(&id); err == nil {
					matchIDs = append(matchIDs, id)
				}
			}
			likeRows.Close()
		}
	}

	if len(matchIDs) == 0 {
		return make([]UIGraphNode, 0), nil
	}

	nodes, _, err := s.fetchNodesByIDs(ctx, matchIDs, 0)
	if err != nil {
		return nil, err
	}
	return nodes, nil
}

// fetchNodesByIDs hydrates UIGraphNode records for a list of symbol IDs.
func (s *UIService) fetchNodesByIDs(ctx context.Context, ids []int64, activeID int64) ([]UIGraphNode, map[int64]bool, error) {
	nodes := make([]UIGraphNode, 0)
	nodeMap := make(map[int64]bool)

	if len(ids) == 0 {
		return nodes, nodeMap, nil
	}

	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}

	q := fmt.Sprintf(`
		SELECT s.id, s.name, s.kind, coalesce(s.signature, ''), f.path, s.line_start, s.line_end, coalesce(s.doc_comment, '')
		FROM code_symbols s
		JOIN graph_files f ON s.file_id = f.id
		WHERE s.id IN (%s)
		  AND f.path NOT LIKE '%%%%.venv%%%%'
		  AND f.path NOT LIKE '%%%%/venv/%%%%'
		  AND f.path NOT LIKE '%%%%/site-packages/%%%%'
		  AND f.path NOT LIKE '%%%%/__pycache__/%%%%'
	`, strings.Join(placeholders, ","))

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to fetch nodes: %w", err)
	}
	defer rows.Close()

	byID := make(map[int64]UIGraphNode, len(ids))
	for rows.Next() {
		var n UIGraphNode
		var id int64
		if err := rows.Scan(&id, &n.Name, &n.Kind, &n.Signature, &n.FilePath, &n.LineStart, &n.LineEnd, &n.Doc); err == nil {
			n.ID = id
			n.IsActive = (id == activeID)
			byID[id] = n
			nodeMap[id] = true
		}
	}

	// Preserve caller-requested ID ordering (e.g. root symbol first or FTS rank order)
	for _, id := range ids {
		if n, ok := byID[id]; ok {
			nodes = append(nodes, n)
		}
	}

	return nodes, nodeMap, nil
}

// fetchEdgesBetweenNodes returns all code edges whose source and target are both present in nodeMap.
func (s *UIService) fetchEdgesBetweenNodes(ctx context.Context, nodeMap map[int64]bool) ([]UIGraphEdge, error) {
	edges := make([]UIGraphEdge, 0)
	if len(nodeMap) == 0 {
		return edges, nil
	}

	var ids []int64
	for id := range nodeMap {
		ids = append(ids, id)
	}

	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids)*2)
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
		args[len(ids)+i] = id
	}
	inList := strings.Join(placeholders, ",")

	q := fmt.Sprintf(`
		SELECT id, source_symbol_id, target_symbol_id, relation, line_number
		FROM code_edges
		WHERE source_symbol_id IN (%s) AND target_symbol_id IN (%s)
	`, inList, inList)

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch edges: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var e UIGraphEdge
		var srcID, tgtID int64
		if err := rows.Scan(&e.ID, &srcID, &tgtID, &e.Relation, &e.Line); err == nil {
			e.SourceID = srcID
			e.TargetID = tgtID
			if nodeMap[srcID] && nodeMap[tgtID] {
				edges = append(edges, e)
			}
		}
	}

	return edges, nil
}

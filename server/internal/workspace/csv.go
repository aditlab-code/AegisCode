package workspace

import (
	"bufio"
	"bytes"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"time"
)

// CsvIndex holds metadata and byte offsets for fast random-access CSV querying.
type CsvIndex struct {
	Path       string
	ModTime    int64
	FileSize   int64
	Delimiter  rune
	Headers    []string
	TotalRows  int
	TotalCols  int
	RowOffsets []int64 // RowOffsets[0] is start of line 0 (headers), RowOffsets[1] is start of row 0
	LastAccess time.Time
}

// CsvIndexCache provides thread-safe in-memory caching of CSV indices.
type CsvIndexCache struct {
	mu      sync.RWMutex
	indices map[string]*CsvIndex
}

var globalCsvCache = &CsvIndexCache{
	indices: make(map[string]*CsvIndex),
}

// CsvQueryOptions contains pagination, column windowing, and search parameters.
type CsvQueryOptions struct {
	Page      int    `json:"page"`
	PageSize  int    `json:"pageSize"`
	ColOffset int    `json:"colOffset"`
	ColLimit  int    `json:"colLimit"`
	Search    string `json:"search"`
}

// CsvQueryResult represents the response returned to the API layer.
type CsvQueryResult struct {
	Headers      []string   `json:"headers"`
	AllHeaders   []string   `json:"allHeaders"`
	Rows         [][]string `json:"rows"`
	TotalRows    int        `json:"totalRows"`
	TotalCols    int        `json:"totalCols"`
	Page         int        `json:"page"`
	PageSize     int        `json:"pageSize"`
	TotalPages   int        `json:"totalPages"`
	ColOffset    int        `json:"colOffset"`
	ColLimit     int        `json:"colLimit"`
	Delimiter    string     `json:"delimiter"`
	Search       string     `json:"search,omitempty"`
	MatchCount   int        `json:"matchCount,omitempty"`
	IsServerSide bool       `json:"isServerSide"`
	QueryTimeMs  float64    `json:"queryTimeMs"`
}

// DetectCsvDelimiter inspects sample bytes to determine comma, semicolon, or tab.
func DetectCsvDelimiter(sample []byte) rune {
	if len(sample) == 0 {
		return ','
	}

	lines := bytes.Split(sample, []byte{'\n'})
	if len(lines) == 0 {
		return ','
	}

	sampleLines := lines
	if len(sampleLines) > 10 {
		sampleLines = sampleLines[:10]
	}

	commaCount := 0
	semiCount := 0
	tabCount := 0

	for _, l := range sampleLines {
		trimmed := bytes.TrimSpace(l)
		if len(trimmed) == 0 {
			continue
		}
		for _, b := range trimmed {
			switch b {
			case ',':
				commaCount++
			case ';':
				semiCount++
			case '\t':
				tabCount++
			}
		}
	}

	if semiCount > commaCount && semiCount > tabCount {
		return ';'
	}
	if tabCount > commaCount && tabCount > semiCount {
		return '\t'
	}
	return ','
}

// GetOrBuildCsvIndex retrieves an existing index or scans the file to build a new one.
func (c *CsvIndexCache) GetOrBuildCsvIndex(filePath string) (*CsvIndex, error) {
	stat, err := os.Stat(filePath)
	if err != nil {
		return nil, fmt.Errorf("stat failed for '%s': %w", filePath, err)
	}

	c.mu.RLock()
	existing, found := c.indices[filePath]
	c.mu.RUnlock()

	if found && existing.ModTime == stat.ModTime().UnixNano() && existing.FileSize == stat.Size() {
		c.mu.Lock()
		existing.LastAccess = time.Now()
		c.mu.Unlock()
		return existing, nil
	}

	// Build new index
	idx, err := buildCsvIndex(filePath, stat)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.indices[filePath] = idx
	c.mu.Unlock()

	return idx, nil
}

func buildCsvIndex(filePath string, stat os.FileInfo) (*CsvIndex, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("open file failed: %w", err)
	}
	defer f.Close()

	// Read small sample to detect delimiter
	sampleBuf := make([]byte, 16*1024)
	nSample, _ := f.Read(sampleBuf)
	delimiter := DetectCsvDelimiter(sampleBuf[:nSample])

	// Reset file pointer
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}

	// Parse header line using csv.Reader
	rHead := csv.NewReader(f)
	rHead.Comma = delimiter
	rHead.FieldsPerRecord = -1
	rHead.LazyQuotes = true
	headers, err := rHead.Read()
	if err != nil && err != io.EOF {
		return nil, fmt.Errorf("failed reading CSV headers: %w", err)
	}

	// Reset file pointer to scan byte offsets
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}

	buf := make([]byte, 1024*1024) // 1MB buffer
	var rowOffsets []int64
	var currentOffset int64
	inQuotes := false

	rowOffsets = append(rowOffsets, 0) // Header line offset

	for {
		n, rErr := f.Read(buf)
		if n > 0 {
			chunk := buf[:n]
			for i := 0; i < n; i++ {
				b := chunk[i]
				if b == '"' {
					inQuotes = !inQuotes
				} else if b == '\n' && !inQuotes {
					nextOffset := currentOffset + int64(i) + 1
					rowOffsets = append(rowOffsets, nextOffset)
				}
			}
			currentOffset += int64(n)
		}
		if rErr == io.EOF {
			break
		}
		if rErr != nil {
			return nil, fmt.Errorf("error reading CSV: %w", rErr)
		}
	}

	// Filter out trailing offset if it points beyond file or at EOF newline
	totalRows := len(rowOffsets) - 1
	if totalRows > 0 && rowOffsets[len(rowOffsets)-1] >= stat.Size() {
		rowOffsets = rowOffsets[:len(rowOffsets)-1]
		totalRows = len(rowOffsets) - 1
	}
	if totalRows < 0 {
		totalRows = 0
	}

	return &CsvIndex{
		Path:       filePath,
		ModTime:    stat.ModTime().UnixNano(),
		FileSize:   stat.Size(),
		Delimiter:  delimiter,
		Headers:    headers,
		TotalRows:  totalRows,
		TotalCols:  len(headers),
		RowOffsets: rowOffsets,
		LastAccess: time.Now(),
	}, nil
}

// QueryCsv executes a paginated, windowed, and optionally filtered query against a CSV file.
func (m *Manager) QueryCsv(relPath string, opts CsvQueryOptions) (*CsvQueryResult, error) {
	startTime := time.Now()

	fullPath, err := m.resolvePath(relPath)
	if err != nil {
		return nil, err
	}

	stat, err := os.Stat(fullPath)
	if err != nil {
		return nil, err
	}
	if stat.IsDir() {
		return nil, fmt.Errorf("path '%s' is a directory, not a CSV file", relPath)
	}

	index, err := globalCsvCache.GetOrBuildCsvIndex(fullPath)
	if err != nil {
		return nil, err
	}

	pageSize := opts.PageSize
	if pageSize <= 0 {
		pageSize = 10
	}
	if pageSize > 1000 {
		pageSize = 1000
	}

	page := opts.Page
	if page <= 0 {
		page = 1
	}

	searchTerm := strings.TrimSpace(opts.Search)

	f, err := os.Open(fullPath)
	if err != nil {
		return nil, fmt.Errorf("failed opening CSV file for query: %w", err)
	}
	defer f.Close()

	var records [][]string
	totalRows := index.TotalRows
	matchCount := 0

	if searchTerm != "" {
		// Fast streaming search across all rows
		searchLower := strings.ToLower(searchTerm)
		var matchingRowIndices []int

		// Stream through rows starting after header (row index 0 is first data row)
		if len(index.RowOffsets) > 1 {
			_, _ = f.Seek(index.RowOffsets[1], io.SeekStart)
			scanner := bufio.NewScanner(f)
			scanBuf := make([]byte, 1024*1024)
			scanner.Buffer(scanBuf, 1024*1024)

			currentRow := 0
			for scanner.Scan() {
				line := scanner.Bytes()
				if bytes.Contains(bytes.ToLower(line), []byte(searchLower)) {
					matchingRowIndices = append(matchingRowIndices, currentRow)
				}
				currentRow++
			}
		}

		matchCount = len(matchingRowIndices)
		totalRows = matchCount
		totalPages := 1
		if totalRows > 0 {
			totalPages = (totalRows + pageSize - 1) / pageSize
		}
		if page > totalPages {
			page = totalPages
		}

		startIdx := (page - 1) * pageSize
		endIdx := startIdx + pageSize
		if startIdx < 0 {
			startIdx = 0
		}
		if startIdx < matchCount {
			if endIdx > matchCount {
				endIdx = matchCount
			}
			targetIndices := matchingRowIndices[startIdx:endIdx]

			for _, rowIdx := range targetIndices {
				if rowIdx+1 < len(index.RowOffsets) {
					startOff := index.RowOffsets[rowIdx+1]
					var endOff int64
					if rowIdx+2 < len(index.RowOffsets) {
						endOff = index.RowOffsets[rowIdx+2]
					} else {
						endOff = index.FileSize
					}

					chunkSize := endOff - startOff
					if chunkSize > 0 {
						chunk := make([]byte, chunkSize)
						if _, err := f.Seek(startOff, io.SeekStart); err == nil {
							if _, err := io.ReadFull(f, chunk); err == nil {
								r := csv.NewReader(bytes.NewReader(chunk))
								r.Comma = index.Delimiter
								r.FieldsPerRecord = -1
								r.LazyQuotes = true
								if row, err := r.Read(); err == nil {
									records = append(records, row)
								}
							}
						}
					}
				}
			}
		}
	} else {
		// Instant random-access seek
		totalPages := 1
		if totalRows > 0 {
			totalPages = (totalRows + pageSize - 1) / pageSize
		}
		if page > totalPages {
			page = totalPages
		}

		startRow := (page - 1) * pageSize
		endRow := startRow + pageSize
		if startRow < 0 {
			startRow = 0
		}
		if endRow > totalRows {
			endRow = totalRows
		}

		if totalRows > 0 && startRow < totalRows && startRow+1 < len(index.RowOffsets) {
			startOff := index.RowOffsets[startRow+1]
			var endOff int64
			if endRow+1 < len(index.RowOffsets) {
				endOff = index.RowOffsets[endRow+1]
			} else {
				endOff = index.FileSize
			}

			chunkSize := endOff - startOff
			if chunkSize > 0 {
				chunk := make([]byte, chunkSize)
				if _, err := f.Seek(startOff, io.SeekStart); err == nil {
					if _, err := io.ReadFull(f, chunk); err == nil {
						r := csv.NewReader(bytes.NewReader(chunk))
						r.Comma = index.Delimiter
						r.FieldsPerRecord = -1
						r.LazyQuotes = true
						for {
							row, err := r.Read()
							if err == io.EOF {
								break
							}
							if err != nil {
								continue
							}
							records = append(records, row)
						}
					}
				}
			}
		}
	}

	// Apply column slicing to records
	colOffset := opts.ColOffset
	if colOffset < 0 {
		colOffset = 0
	}
	colLimit := opts.ColLimit
	if colLimit <= 0 {
		colLimit = index.TotalCols
	}

	slicedHeaders := sliceColumns(index.Headers, colOffset, colLimit)
	var windowedRows [][]string
	for _, rec := range records {
		windowedRows = append(windowedRows, sliceColumns(rec, colOffset, colLimit))
	}

	totalPages := 1
	if totalRows > 0 {
		totalPages = (totalRows + pageSize - 1) / pageSize
	}

	elapsed := float64(time.Since(startTime).Microseconds()) / 1000.0

	return &CsvQueryResult{
		Headers:      slicedHeaders,
		AllHeaders:   index.Headers,
		Rows:         windowedRows,
		TotalRows:    totalRows,
		TotalCols:    index.TotalCols,
		Page:         page,
		PageSize:     pageSize,
		TotalPages:   totalPages,
		ColOffset:    colOffset,
		ColLimit:     colLimit,
		Delimiter:    string(index.Delimiter),
		Search:       searchTerm,
		MatchCount:   matchCount,
		IsServerSide: true,
		QueryTimeMs:  elapsed,
	}, nil
}

func sliceColumns(row []string, offset int, limit int) []string {
	if offset >= len(row) {
		return []string{}
	}
	end := offset + limit
	if end > len(row) {
		end = len(row)
	}
	return row[offset:end]
}

// InvalidateCsvCache evicts an indexed entry from the cache when modified.
func InvalidateCsvCache(filePath string) {
	globalCsvCache.mu.Lock()
	delete(globalCsvCache.indices, filePath)
	globalCsvCache.mu.Unlock()
}

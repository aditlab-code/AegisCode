package workspace

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDetectCsvDelimiter(t *testing.T) {
	commaData := []byte("id,name,age\n1,Alice,30\n2,Bob,25")
	if d := DetectCsvDelimiter(commaData); d != ',' {
		t.Errorf("expected ',', got '%c'", d)
	}

	semiData := []byte("id;name;score\n1;Carlos;95,5\n2;Diana;88,0")
	if d := DetectCsvDelimiter(semiData); d != ';' {
		t.Errorf("expected ';', got '%c'", d)
	}

	tabData := []byte("id\tname\trole\n1\tEvan\tadmin\n2\tFiona\tuser")
	if d := DetectCsvDelimiter(tabData); d != '\t' {
		t.Errorf("expected '\\t', got '%c'", d)
	}
}

func TestCsvIndexingAndRandomSeek(t *testing.T) {
	tmpDir := t.TempDir()
	mgr, err := NewManager(tmpDir)
	if err != nil {
		t.Fatalf("failed creating manager: %v", err)
	}

	// Generate a 200-row CSV with 10 columns
	var sb strings.Builder
	headers := []string{"id", "col1", "col2", "col3", "col4", "col5", "col6", "col7", "col8", "col9"}
	sb.WriteString(strings.Join(headers, ",") + "\n")
	for i := 1; i <= 200; i++ {
		row := fmt.Sprintf("row_%03d,val_1_%d,val_2_%d,val_3_%d,val_4_%d,val_5_%d,val_6_%d,val_7_%d,val_8_%d,val_9_%d\n",
			i, i, i, i, i, i, i, i, i, i)
		sb.WriteString(row)
	}

	filePath := filepath.Join(tmpDir, "test_large.csv")
	if err := os.WriteFile(filePath, []byte(sb.String()), 0644); err != nil {
		t.Fatalf("failed writing test CSV: %v", err)
	}

	// Test Page 1, PageSize 10
	res1, err := mgr.QueryCsv("test_large.csv", CsvQueryOptions{
		Page:     1,
		PageSize: 10,
	})
	if err != nil {
		t.Fatalf("QueryCsv page 1 failed: %v", err)
	}

	if res1.TotalRows != 200 {
		t.Errorf("expected 200 total rows, got %d", res1.TotalRows)
	}
	if res1.TotalCols != 10 {
		t.Errorf("expected 10 columns, got %d", res1.TotalCols)
	}
	if len(res1.Rows) != 10 {
		t.Fatalf("expected 10 rows on page 1, got %d", len(res1.Rows))
	}
	if res1.Rows[0][0] != "row_001" {
		t.Errorf("expected first row to be row_001, got %s", res1.Rows[0][0])
	}
	if res1.Rows[9][0] != "row_010" {
		t.Errorf("expected tenth row to be row_010, got %s", res1.Rows[9][0])
	}

	// Test Page 15, PageSize 10 (rows 141..150)
	res15, err := mgr.QueryCsv("test_large.csv", CsvQueryOptions{
		Page:     15,
		PageSize: 10,
	})
	if err != nil {
		t.Fatalf("QueryCsv page 15 failed: %v", err)
	}
	if len(res15.Rows) != 10 {
		t.Fatalf("expected 10 rows on page 15, got %d", len(res15.Rows))
	}
	if res15.Rows[0][0] != "row_141" {
		t.Errorf("expected row_141 on page 15, got %s", res15.Rows[0][0])
	}
}

func TestCsvColumnWindowing(t *testing.T) {
	tmpDir := t.TempDir()
	mgr, err := NewManager(tmpDir)
	if err != nil {
		t.Fatalf("failed creating manager: %v", err)
	}

	var sb strings.Builder
	sb.WriteString("c0,c1,c2,c3,c4,c5,c6,c7,c8,c9\n")
	sb.WriteString("v0,v1,v2,v3,v4,v5,v6,v7,v8,v9\n")

	filePath := filepath.Join(tmpDir, "window.csv")
	if err := os.WriteFile(filePath, []byte(sb.String()), 0644); err != nil {
		t.Fatalf("failed writing window.csv: %v", err)
	}

	// Request columns 3..5 (colOffset: 3, colLimit: 3)
	res, err := mgr.QueryCsv("window.csv", CsvQueryOptions{
		Page:      1,
		PageSize:  10,
		ColOffset: 3,
		ColLimit:  3,
	})
	if err != nil {
		t.Fatalf("QueryCsv failed: %v", err)
	}

	if len(res.Headers) != 3 {
		t.Fatalf("expected 3 sliced headers, got %d", len(res.Headers))
	}
	if res.Headers[0] != "c3" || res.Headers[1] != "c4" || res.Headers[2] != "c5" {
		t.Errorf("unexpected sliced headers: %v", res.Headers)
	}
	if len(res.Rows) != 1 || len(res.Rows[0]) != 3 {
		t.Fatalf("unexpected rows structure: %v", res.Rows)
	}
	if res.Rows[0][0] != "v3" || res.Rows[0][1] != "v4" || res.Rows[0][2] != "v5" {
		t.Errorf("unexpected sliced row data: %v", res.Rows[0])
	}
	if len(res.AllHeaders) != 10 {
		t.Errorf("expected 10 AllHeaders, got %d", len(res.AllHeaders))
	}
}

func TestCsvStreamingSearch(t *testing.T) {
	tmpDir := t.TempDir()
	mgr, err := NewManager(tmpDir)
	if err != nil {
		t.Fatalf("failed creating manager: %v", err)
	}

	var sb strings.Builder
	sb.WriteString("id,username,city\n")
	sb.WriteString("1,john_doe,New York\n")
	sb.WriteString("2,jane_doe,Los Angeles\n")
	sb.WriteString("3,bob_smith,Chicago\n")
	sb.WriteString("4,alice_wonder,San Francisco\n")
	sb.WriteString("5,john_wick,New York\n")

	filePath := filepath.Join(tmpDir, "search.csv")
	if err := os.WriteFile(filePath, []byte(sb.String()), 0644); err != nil {
		t.Fatalf("failed writing search.csv: %v", err)
	}

	// Search for "new york"
	res, err := mgr.QueryCsv("search.csv", CsvQueryOptions{
		Page:     1,
		PageSize: 10,
		Search:   "new york",
	})
	if err != nil {
		t.Fatalf("QueryCsv search failed: %v", err)
	}

	if res.MatchCount != 2 {
		t.Errorf("expected 2 matches for 'new york', got %d", res.MatchCount)
	}
	if len(res.Rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(res.Rows))
	}
	if res.Rows[0][1] != "john_doe" || res.Rows[1][1] != "john_wick" {
		t.Errorf("unexpected search results: %v", res.Rows)
	}
}

func TestCsvRFC4180Quotes(t *testing.T) {
	tmpDir := t.TempDir()
	mgr, err := NewManager(tmpDir)
	if err != nil {
		t.Fatalf("failed creating manager: %v", err)
	}

	// CSV with quoted commas and quoted newlines
	data := "id,description,status\n1,\"Item with, comma\",active\n2,\"Multi-line\ndescription\",pending\n3,Simple,done\n"
	filePath := filepath.Join(tmpDir, "quotes.csv")
	if err := os.WriteFile(filePath, []byte(data), 0644); err != nil {
		t.Fatalf("failed writing quotes.csv: %v", err)
	}

	res, err := mgr.QueryCsv("quotes.csv", CsvQueryOptions{
		Page:     1,
		PageSize: 10,
	})
	if err != nil {
		t.Fatalf("QueryCsv quotes failed: %v", err)
	}

	if res.TotalRows != 3 {
		t.Errorf("expected 3 rows despite multiline quote, got %d", res.TotalRows)
	}
	if len(res.Rows) != 3 {
		t.Fatalf("expected 3 parsed rows, got %d", len(res.Rows))
	}
	if res.Rows[0][1] != "Item with, comma" {
		t.Errorf("unexpected row 0 cell: %s", res.Rows[0][1])
	}
	if res.Rows[1][1] != "Multi-line\ndescription" {
		t.Errorf("unexpected row 1 cell: %s", res.Rows[1][1])
	}
	if res.Rows[2][1] != "Simple" {
		t.Errorf("unexpected row 2 cell: %s", res.Rows[2][1])
	}
}

func TestLargeCsvPagination(t *testing.T) {
	tmpDir := t.TempDir()
	mgr, err := NewManager(tmpDir)
	if err != nil {
		t.Fatalf("failed creating manager: %v", err)
	}

	// Generate synthetic dataset (5,000 rows)
	filePath := filepath.Join(tmpDir, "large_dataset.csv")
	f, err := os.Create(filePath)
	if err != nil {
		t.Fatalf("failed creating test csv: %v", err)
	}

	w := bufio.NewWriter(f)
	_, _ = w.WriteString("id,transaction_id,amount,status,notes\n")
	for i := 1; i <= 5000; i++ {
		_, _ = fmt.Fprintf(w, "%d,tx-%06d,%d.50,active,note-%d\n", i, i, i*10, i)
	}
	_ = w.Flush()
	_ = f.Close()

	// Query page 1
	res, err := mgr.QueryCsv("large_dataset.csv", CsvQueryOptions{
		Page:     1,
		PageSize: 10,
	})
	if err != nil {
		t.Fatalf("QueryCsv failed: %v", err)
	}

	if res.TotalRows != 5000 {
		t.Errorf("expected 5000 total rows, got %d", res.TotalRows)
	}
	if len(res.Rows) != 10 {
		t.Errorf("expected 10 rows returned, got %d", len(res.Rows))
	}

	// Test deep seek page (page 400)
	resPage400, err := mgr.QueryCsv("large_dataset.csv", CsvQueryOptions{
		Page:     400,
		PageSize: 10,
	})
	if err != nil {
		t.Fatalf("QueryCsv page 400 failed: %v", err)
	}
	if len(resPage400.Rows) != 10 {
		t.Errorf("expected 10 rows on page 400, got %d", len(resPage400.Rows))
	}
}

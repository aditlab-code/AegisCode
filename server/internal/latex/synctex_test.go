package latex

import (
	"testing"
)

func TestParseForwardOutput(t *testing.T) {
	sampleOutput := `SyncTeX result begin
Output:sample.pdf
Page:2
x:123.450
y:678.900
W:350.000
H:14.500
SyncTeX result end`

	target, err := parseForwardOutput(sampleOutput)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if target.Page != 2 {
		t.Errorf("expected page 2, got %d", target.Page)
	}
	if target.X != 123.45 {
		t.Errorf("expected x 123.45, got %f", target.X)
	}
	if target.Y != 678.90 {
		t.Errorf("expected y 678.90, got %f", target.Y)
	}
	if target.Width != 350.0 {
		t.Errorf("expected width 350.0, got %f", target.Width)
	}
}

func TestParseInverseOutput(t *testing.T) {
	sampleOutput := `SyncTeX result begin
Output:sample.pdf
Entry:
Input:/workspace/chapters/intro.tex
Line:42
Column:5
SyncTeX result end`

	pos, err := parseInverseOutput(sampleOutput, "/workspace")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if pos.File != "chapters/intro.tex" {
		t.Errorf("expected file chapters/intro.tex, got %s", pos.File)
	}
	if pos.Line != 42 {
		t.Errorf("expected line 42, got %d", pos.Line)
	}
	if pos.Column != 5 {
		t.Errorf("expected column 5, got %d", pos.Column)
	}
}

package latex

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// SyncTarget is the visual coordinate on the PDF returned by Forward Search.
type SyncTarget struct {
	Page   int     `json:"page"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// SourcePosition is the source file location returned by Inverse Search.
type SourcePosition struct {
	File   string `json:"file"`
	Line   int    `json:"line"`
	Column int    `json:"column"`
}

// SyncTeXService coordinates forward and inverse coordinate lookups.
type SyncTeXService struct {
	workspaceRoot string
}

// NewSyncTeXService creates a new SyncTeX coordinator.
func NewSyncTeXService(workspaceRoot string) *SyncTeXService {
	return &SyncTeXService{workspaceRoot: workspaceRoot}
}

// ForwardSearch maps a source line/col to a visual location in the PDF.
func (s *SyncTeXService) ForwardSearch(ctx context.Context, texFile string, line, column int, pdfFile string) (*SyncTarget, error) {
	if _, err := exec.LookPath("synctex"); err != nil {
		return nil, errors.New("synctex binary not found in PATH")
	}

	cleanTex := filepath.Clean(texFile)
	if !filepath.IsAbs(cleanTex) {
		cleanTex = filepath.Join(s.workspaceRoot, cleanTex)
	}

	cleanPdf := filepath.Clean(pdfFile)
	if !filepath.IsAbs(cleanPdf) {
		cleanPdf = filepath.Join(s.workspaceRoot, cleanPdf)
	}

	argInput := fmt.Sprintf("%d:%d:%s", line, column, cleanTex)
	cmd := exec.CommandContext(ctx, "synctex", "view", "-i", argInput, "-o", cleanPdf)
	cmd.Dir = filepath.Dir(cleanPdf)

	out, err := cmd.Output()
	if err != nil {
		// Try with relative path from PDF dir
		relTex, relErr := filepath.Rel(filepath.Dir(cleanPdf), cleanTex)
		if relErr == nil {
			cmd = exec.CommandContext(ctx, "synctex", "view", "-i", fmt.Sprintf("%d:%d:%s", line, column, relTex), "-o", cleanPdf)
			cmd.Dir = filepath.Dir(cleanPdf)
			out, err = cmd.Output()
		}
		if err != nil {
			return nil, fmt.Errorf("synctex forward search failed: %w", err)
		}
	}

	return parseForwardOutput(string(out))
}

// InverseSearch maps a PDF page and coordinate point to the source TeX line/col.
func (s *SyncTeXService) InverseSearch(ctx context.Context, pdfFile string, page int, x, y float64) (*SourcePosition, error) {
	if _, err := exec.LookPath("synctex"); err != nil {
		return nil, errors.New("synctex binary not found in PATH")
	}

	cleanPdf := filepath.Clean(pdfFile)
	if !filepath.IsAbs(cleanPdf) {
		cleanPdf = filepath.Join(s.workspaceRoot, cleanPdf)
	}

	arg := fmt.Sprintf("%d:%f:%f:%s", page, x, y, cleanPdf)
	cmd := exec.CommandContext(ctx, "synctex", "edit", "-o", arg)
	cmd.Dir = filepath.Dir(cleanPdf)

	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("synctex inverse search failed: %w", err)
	}

	return parseInverseOutput(string(out), s.workspaceRoot)
}

func parseForwardOutput(out string) (*SyncTarget, error) {
	scanner := bufio.NewScanner(strings.NewReader(out))
	target := &SyncTarget{Page: 1}
	found := false

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "SyncTeX result end" {
			break
		}
		// If another record begins and we already extracted x and y, stop at the first most accurate record
		if strings.HasPrefix(line, "Output:") && found {
			break
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])

		switch key {
		case "Page":
			if p, err := strconv.Atoi(val); err == nil {
				target.Page = p
			}
		case "x":
			if f, err := strconv.ParseFloat(val, 64); err == nil {
				target.X = f
				found = true
			}
		case "y":
			if f, err := strconv.ParseFloat(val, 64); err == nil {
				target.Y = f
			}
		case "W":
			if f, err := strconv.ParseFloat(val, 64); err == nil {
				target.Width = f
			}
		case "H":
			if f, err := strconv.ParseFloat(val, 64); err == nil {
				target.Height = f
			}
		}
	}

	if !found {
		return nil, errors.New("no synctex forward record matched")
	}

	return target, nil
}

func parseInverseOutput(out string, workspaceRoot string) (*SourcePosition, error) {
	scanner := bufio.NewScanner(strings.NewReader(out))
	pos := &SourcePosition{}
	found := false

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])

		switch key {
		case "Input":
			pos.File = val
			found = true
		case "Line":
			if l, err := strconv.Atoi(val); err == nil {
				pos.Line = l
				found = true
			}
		case "Column":
			if c, err := strconv.Atoi(val); err == nil {
				pos.Column = c
			}
		}
	}

	if !found || pos.File == "" {
		return nil, errors.New("no synctex inverse record matched")
	}

	// Make relative to workspace if possible
	if filepath.IsAbs(pos.File) {
		if rel, err := filepath.Rel(workspaceRoot, pos.File); err == nil && !strings.HasPrefix(rel, "..") {
			pos.File = rel
		}
	}

	return pos, nil
}

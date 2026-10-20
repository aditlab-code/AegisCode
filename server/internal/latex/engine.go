package latex

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// EngineType represents supported LaTeX compiler recipes.
type EngineType string

const (
	EngineAuto     EngineType = "auto"
	EngineXeLaTeX  EngineType = "xelatex"
	EnginePdfLaTeX EngineType = "pdflatex"
	EngineLuaLaTeX EngineType = "lualatex"
	EngineTectonic EngineType = "tectonic"
)

// ToolchainStatus describes availability of LaTeX CLI binaries on the system.
type ToolchainStatus struct {
	Latexmk  bool   `json:"latexmk"`
	XeLaTeX  bool   `json:"xelatex"`
	PdfLaTeX bool   `json:"pdflatex"`
	LuaLaTeX bool   `json:"lualatex"`
	Tectonic bool   `json:"tectonic"`
	SyncTeX  bool   `json:"synctex"`
	TexLab   bool   `json:"texlab"`
	Default  string `json:"default"`
}

// CompileResult represents the outcome of a LaTeX build.
type CompileResult struct {
	Success    bool     `json:"success"`
	PdfPath    string   `json:"pdfPath,omitempty"`
	RootFile   string   `json:"rootFile"`
	EngineUsed string   `json:"engineUsed"`
	DurationMs int64    `json:"durationMs"`
	Output     string   `json:"output"`
	Errors     []string `json:"errors,omitempty"`
}

// CompilerEngine orchestrates compiling LaTeX documents.
type CompilerEngine struct {
	workspaceRoot string
}

// NewCompilerEngine creates a new compiler instance.
func NewCompilerEngine(workspaceRoot string) *CompilerEngine {
	return &CompilerEngine{workspaceRoot: workspaceRoot}
}

// CheckToolchain probes which LaTeX tools are present in PATH.
func (c *CompilerEngine) CheckToolchain() ToolchainStatus {
	st := ToolchainStatus{}
	_, err := exec.LookPath("latexmk")
	st.Latexmk = (err == nil)

	_, err = exec.LookPath("xelatex")
	st.XeLaTeX = (err == nil)

	_, err = exec.LookPath("pdflatex")
	st.PdfLaTeX = (err == nil)

	_, err = exec.LookPath("lualatex")
	st.LuaLaTeX = (err == nil)

	_, err = exec.LookPath("tectonic")
	st.Tectonic = (err == nil)

	_, err = exec.LookPath("synctex")
	st.SyncTeX = (err == nil)

	_, err = exec.LookPath("texlab")
	st.TexLab = (err == nil)

	if st.Latexmk && st.XeLaTeX {
		st.Default = string(EngineXeLaTeX)
	} else if st.Tectonic {
		st.Default = string(EngineTectonic)
	} else if st.Latexmk && st.PdfLaTeX {
		st.Default = string(EnginePdfLaTeX)
	} else if st.PdfLaTeX {
		st.Default = string(EnginePdfLaTeX)
	} else {
		st.Default = "none"
	}

	return st
}

// Compile executes the compilation of rootFilePath with the specified engine.
func (c *CompilerEngine) Compile(ctx context.Context, rootFilePath string, recipe EngineType) (*CompileResult, error) {
	if rootFilePath == "" {
		return nil, errors.New("root file path cannot be empty")
	}

	cleanRoot := filepath.Clean(rootFilePath)
	if !filepath.IsAbs(cleanRoot) {
		cleanRoot = filepath.Join(c.workspaceRoot, cleanRoot)
	}

	if _, err := os.Stat(cleanRoot); err != nil {
		return nil, fmt.Errorf("root file not found: %s", cleanRoot)
	}

	toolchain := c.CheckToolchain()

	selectedEngine := recipe
	if selectedEngine == EngineAuto || selectedEngine == "" {
		selectedEngine = EngineType(toolchain.Default)
		if selectedEngine == "none" {
			return &CompileResult{
				Success:  false,
				RootFile: cleanRoot,
				Errors: []string{
					"No LaTeX compiler found in system PATH. Please install TeX Live (with latexmk and xelatex) or Tectonic.",
				},
			}, nil
		}
	}

	workDir := filepath.Dir(cleanRoot)
	baseName := filepath.Base(cleanRoot)
	ext := filepath.Ext(baseName)
	nameWithoutExt := strings.TrimSuffix(baseName, ext)
	expectedPdf := filepath.Join(workDir, nameWithoutExt+".pdf")

	startTime := time.Now()
	var cmd *exec.Cmd

	switch selectedEngine {
	case EngineXeLaTeX:
		if toolchain.Latexmk {
			cmd = exec.CommandContext(ctx, "latexmk",
				"-xelatex",
				"-synctex=1",
				"-interaction=nonstopmode",
				"-file-line-error",
				baseName,
			)
		} else if toolchain.XeLaTeX {
			cmd = exec.CommandContext(ctx, "xelatex",
				"-synctex=1",
				"-interaction=nonstopmode",
				"-file-line-error",
				baseName,
			)
		} else {
			return nil, fmt.Errorf("xelatex engine requested but not found in PATH")
		}

	case EnginePdfLaTeX:
		if toolchain.Latexmk {
			cmd = exec.CommandContext(ctx, "latexmk",
				"-pdf",
				"-synctex=1",
				"-interaction=nonstopmode",
				"-file-line-error",
				baseName,
			)
		} else if toolchain.PdfLaTeX {
			cmd = exec.CommandContext(ctx, "pdflatex",
				"-synctex=1",
				"-interaction=nonstopmode",
				"-file-line-error",
				baseName,
			)
		} else {
			return nil, fmt.Errorf("pdflatex engine requested but not found in PATH")
		}

	case EngineLuaLaTeX:
		if toolchain.Latexmk {
			cmd = exec.CommandContext(ctx, "latexmk",
				"-lualatex",
				"-synctex=1",
				"-interaction=nonstopmode",
				"-file-line-error",
				baseName,
			)
		} else if toolchain.LuaLaTeX {
			cmd = exec.CommandContext(ctx, "lualatex",
				"-synctex=1",
				"-interaction=nonstopmode",
				"-file-line-error",
				baseName,
			)
		} else {
			return nil, fmt.Errorf("lualatex engine requested but not found in PATH")
		}

	case EngineTectonic:
		if toolchain.Tectonic {
			cmd = exec.CommandContext(ctx, "tectonic",
				"-Z", "synctex",
				baseName,
			)
		} else {
			return nil, fmt.Errorf("tectonic engine requested but not found in PATH")
		}

	default:
		return nil, fmt.Errorf("unknown engine recipe: %s", selectedEngine)
	}

	cmd.Dir = workDir
	outBytes, runErr := cmd.CombinedOutput()
	duration := time.Since(startTime).Milliseconds()
	outputStr := string(outBytes)

	// Parse errors from log
	parsedErrors := parseLatexErrors(outputStr)

	// Check if PDF was successfully created or updated
	pdfExists := false
	if fi, err := os.Stat(expectedPdf); err == nil && !fi.IsDir() {
		pdfExists = true
	}

	success := (runErr == nil || pdfExists) && len(parsedErrors) == 0

	relPdf, _ := filepath.Rel(c.workspaceRoot, expectedPdf)
	if relPdf == "" || strings.HasPrefix(relPdf, "..") {
		relPdf = expectedPdf
	}

	return &CompileResult{
		Success:    success,
		PdfPath:    relPdf,
		RootFile:   cleanRoot,
		EngineUsed: string(selectedEngine),
		DurationMs: duration,
		Output:     outputStr,
		Errors:     parsedErrors,
	}, nil
}

// parseLatexErrors scans compiler output for fatal ! and error lines.
func parseLatexErrors(output string) []string {
	var errs []string
	lines := strings.Split(output, "\n")
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if strings.HasPrefix(trimmed, "!") {
			errs = append(errs, trimmed)
		} else if strings.Contains(trimmed, ": error:") || strings.Contains(trimmed, "Fatal error occurred") {
			errs = append(errs, trimmed)
		}
	}
	return errs
}

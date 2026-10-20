package latex

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	// Matches %! TeX root = ... or % !TEX root = ...
	magicCommentRegex = regexp.MustCompile(`(?i)^%\s*!?\s*tex\s+root\s*=\s*(.+)$`)
)

// RootResolver resolves the master/root .tex document for a given source file.
type RootResolver struct {
	workspaceRoot string
}

// NewRootResolver creates a new resolver scoped to the workspace directory.
func NewRootResolver(workspaceRoot string) *RootResolver {
	return &RootResolver{workspaceRoot: workspaceRoot}
}

// ResolveRoot finds the root TeX file for targetFilePath.
func (r *RootResolver) ResolveRoot(targetFilePath string) (string, error) {
	cleanTarget := filepath.Clean(targetFilePath)
	if !filepath.IsAbs(cleanTarget) {
		cleanTarget = filepath.Join(r.workspaceRoot, cleanTarget)
	}

	// 1. Check for Magic Comment in target file header
	if rootFromComment, ok := r.checkMagicComment(cleanTarget); ok {
		resolved := rootFromComment
		if !filepath.IsAbs(resolved) {
			resolved = filepath.Clean(filepath.Join(filepath.Dir(cleanTarget), rootFromComment))
		}
		if _, err := os.Stat(resolved); err == nil {
			return resolved, nil
		}
	}

	// 2. Check workspace configuration (aegis.json or .vscode/settings.json)
	if rootFromConfig, ok := r.checkProjectConfig(); ok {
		resolved := rootFromConfig
		if !filepath.IsAbs(resolved) {
			resolved = filepath.Clean(filepath.Join(r.workspaceRoot, rootFromConfig))
		}
		if _, err := os.Stat(resolved); err == nil {
			return resolved, nil
		}
	}

	// 3. Check if target file itself has \documentclass
	if r.hasDocumentClass(cleanTarget) {
		return cleanTarget, nil
	}

	// 4. Scan workspace for .tex files with \documentclass and \begin{document}
	if candidate, ok := r.scanWorkspaceForRoot(); ok {
		return candidate, nil
	}

	// Default fallback: return target file itself
	return cleanTarget, nil
}

func (r *RootResolver) checkMagicComment(filePath string) (string, bool) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", false
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	lineCount := 0
	for scanner.Scan() && lineCount < 25 {
		lineCount++
		line := strings.TrimSpace(scanner.Text())
		if matches := magicCommentRegex.FindStringSubmatch(line); len(matches) > 1 {
			target := strings.TrimSpace(matches[1])
			target = strings.Trim(target, `"'`)
			if target != "" {
				return target, true
			}
		}
	}
	return "", false
}

func (r *RootResolver) checkProjectConfig() (string, bool) {
	// Check aegis.json
	aegisPath := filepath.Join(r.workspaceRoot, "aegis.json")
	if data, err := os.ReadFile(aegisPath); err == nil {
		var cfg struct {
			Latex struct {
				RootFile string `json:"rootFile"`
			} `json:"latex"`
		}
		if err := json.Unmarshal(data, &cfg); err == nil && cfg.Latex.RootFile != "" {
			return cfg.Latex.RootFile, true
		}
	}

	// Check .vscode/settings.json
	vscodePath := filepath.Join(r.workspaceRoot, ".vscode", "settings.json")
	if data, err := os.ReadFile(vscodePath); err == nil {
		var settings map[string]interface{}
		if err := json.Unmarshal(data, &settings); err == nil {
			if v, ok := settings["latex-workshop.latex.rootFile"].(string); ok && v != "" {
				return v, true
			}
			if v, ok := settings["latex.rootFile"].(string); ok && v != "" {
				return v, true
			}
		}
	}

	return "", false
}

func (r *RootResolver) hasDocumentClass(filePath string) bool {
	f, err := os.Open(filePath)
	if err != nil {
		return false
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "%") {
			continue
		}
		if strings.Contains(line, `\documentclass`) {
			return true
		}
	}
	return false
}

func (r *RootResolver) scanWorkspaceForRoot() (string, bool) {
	var bestCandidate string
	_ = filepath.Walk(r.workspaceRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			name := info.Name()
			if strings.HasPrefix(name, ".") || name == "node_modules" || name == "dist" || name == "build" {
				return filepath.SkipDir
			}
			return nil
		}

		if strings.ToLower(filepath.Ext(path)) == ".tex" {
			if r.hasDocumentClass(path) {
				// Prefer main.tex or document.tex
				base := strings.ToLower(filepath.Base(path))
				if base == "main.tex" || base == "document.tex" || base == "thesis.tex" || base == "paper.tex" {
					bestCandidate = path
					return filepath.SkipAll
				}
				if bestCandidate == "" {
					bestCandidate = path
				}
			}
		}
		return nil
	})

	if bestCandidate != "" {
		return bestCandidate, true
	}
	return "", false
}

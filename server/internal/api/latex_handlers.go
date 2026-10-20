package api

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/latex"
)

type latexCompileRequest struct {
	File   string           `json:"file"`
	Engine latex.EngineType `json:"engine"`
}

type latexSyncForwardRequest struct {
	File    string `json:"file"`
	Line    int    `json:"line"`
	Column  int    `json:"column"`
	PdfFile string `json:"pdfFile"`
}

type latexSyncInverseRequest struct {
	PdfFile string  `json:"pdfFile"`
	Page    int     `json:"page"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
}

// handleLatexStatus checks available LaTeX binaries on host.
func (s *Server) handleLatexStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	rootPath, _ := s.ws.GetRoot()
	engine := latex.NewCompilerEngine(rootPath)
	status := engine.CheckToolchain()

	jsonResponse(w, http.StatusOK, status)
}

// handleLatexCompile triggers LaTeX compilation for the resolved root document.
func (s *Server) handleLatexCompile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req latexCompileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if strings.TrimSpace(req.File) == "" {
		jsonError(w, http.StatusBadRequest, "file parameter is required")
		return
	}

	resolvedTarget, err := s.ws.ResolvePath(req.File)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "invalid file path")
		return
	}

	rootPath, _ := s.ws.GetRoot()
	resolver := latex.NewRootResolver(rootPath)
	rootDoc, err := resolver.ResolveRoot(resolvedTarget)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to resolve root document: "+err.Error())
		return
	}

	engine := latex.NewCompilerEngine(rootPath)
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Minute)
	defer cancel()

	result, err := engine.Compile(ctx, rootDoc, req.Engine)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "compilation failed: "+err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, result)
}

// handleLatexSyncForward resolves PDF coordinates from source line/col.
func (s *Server) handleLatexSyncForward(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req latexSyncForwardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if strings.TrimSpace(req.File) == "" {
		jsonError(w, http.StatusBadRequest, "file parameter is required")
		return
	}

	resolvedTarget, err := s.ws.ResolvePath(req.File)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "invalid file path")
		return
	}

	rootPath, _ := s.ws.GetRoot()
	pdfPath := req.PdfFile
	if pdfPath == "" {
		resolver := latex.NewRootResolver(rootPath)
		rootDoc, err := resolver.ResolveRoot(resolvedTarget)
		if err == nil {
			dir := filepath.Dir(rootDoc)
			base := strings.TrimSuffix(filepath.Base(rootDoc), filepath.Ext(rootDoc))
			pdfPath = filepath.Join(dir, base+".pdf")
		}
	} else {
		if resolvedPdf, err := s.ws.ResolvePath(pdfPath); err == nil {
			pdfPath = resolvedPdf
		}
	}

	if _, statErr := os.Stat(pdfPath); statErr != nil {
		jsonError(w, http.StatusNotFound, "PDF document not compiled yet. Please compile first (Ctrl+Alt+B).")
		return
	}

	synctexService := latex.NewSyncTeXService(rootPath)
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	target, err := synctexService.ForwardSearch(ctx, resolvedTarget, req.Line, req.Column, pdfPath)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "forward search failed: "+err.Error())
		return
	}

	// Attach PDF relative path so viewer knows which PDF file to sync
	relPdf, _ := filepath.Rel(rootPath, pdfPath)
	type forwardResp struct {
		latex.SyncTarget
		PdfFile string `json:"pdfFile"`
	}

	jsonResponse(w, http.StatusOK, forwardResp{
		SyncTarget: *target,
		PdfFile:    relPdf,
	})
}

// handleLatexSyncInverse resolves source file/line from PDF coordinates.
func (s *Server) handleLatexSyncInverse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req latexSyncInverseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if strings.TrimSpace(req.PdfFile) == "" {
		jsonError(w, http.StatusBadRequest, "pdfFile parameter is required")
		return
	}

	resolvedPdf, err := s.ws.ResolvePath(req.PdfFile)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "invalid pdfFile path")
		return
	}

	rootPath, _ := s.ws.GetRoot()
	synctexService := latex.NewSyncTeXService(rootPath)
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	pos, err := synctexService.InverseSearch(ctx, resolvedPdf, req.Page, req.X, req.Y)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "inverse search failed: "+err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, pos)
}

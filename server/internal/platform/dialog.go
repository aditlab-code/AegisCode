package platform

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// FolderPicker defines the interface at the host dialog seam.
type FolderPicker interface {
	PickFolder(ctx context.Context) (path string, cancelled bool, err error)
}

// NativeFolderPicker implements FolderPicker using OS-native GUI dialogs.
type NativeFolderPicker struct{}

func NewNativeFolderPicker() *NativeFolderPicker {
	return &NativeFolderPicker{}
}

func (p *NativeFolderPicker) PickFolder(ctx context.Context) (string, bool, error) {
	switch runtime.GOOS {
	case "darwin":
		cmd := exec.CommandContext(ctx, "osascript", "-e", `POSIX path of (choose folder with prompt "Select Project Folder:")`)
		out, err := cmd.Output()
		if err != nil {
			var exitErr *exec.ExitError
			if errors.As(err, &exitErr) {
				combined := strings.ToLower(string(exitErr.Stderr) + " " + err.Error())
				if strings.Contains(combined, "user canceled") || strings.Contains(combined, "canceled") || exitErr.ExitCode() == 1 {
					return "", true, nil
				}
			}
			return "", false, fmt.Errorf("osascript dialog failed: %w", err)
		}
		chosen := strings.TrimSpace(string(out))
		if chosen == "" {
			return "", true, nil
		}
		return filepath.Clean(chosen), false, nil

	case "windows":
		psScript := `[System.Reflection.Assembly]::LoadWithPartialName('System.windows.forms') | Out-Null; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Project Folder'; $f.ShowNewFolderButton = $true; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath } else { Write-Output 'CANCELLED' }`
		cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", psScript)
		out, err := cmd.Output()
		if err != nil {
			return "", false, fmt.Errorf("powershell dialog failed: %w", err)
		}
		chosen := strings.TrimSpace(string(out))
		if chosen == "" || chosen == "CANCELLED" {
			return "", true, nil
		}
		return filepath.Clean(chosen), false, nil

	case "linux":
		if _, lookErr := exec.LookPath("zenity"); lookErr == nil {
			cmd := exec.CommandContext(ctx, "zenity", "--file-selection", "--directory", "--title=Select Project Folder")
			out, err := cmd.Output()
			if err != nil {
				return "", true, nil
			}
			chosen := strings.TrimSpace(string(out))
			if chosen == "" {
				return "", true, nil
			}
			return filepath.Clean(chosen), false, nil
		}
		if _, lookErr := exec.LookPath("kdialog"); lookErr == nil {
			cmd := exec.CommandContext(ctx, "kdialog", "--getexistingdirectory")
			out, err := cmd.Output()
			if err != nil {
				return "", true, nil
			}
			chosen := strings.TrimSpace(string(out))
			if chosen == "" {
				return "", true, nil
			}
			return filepath.Clean(chosen), false, nil
		}
		return "", false, errors.New("no native file dialog tool available on linux (zenity or kdialog required)")

	default:
		return "", false, fmt.Errorf("native file dialog is not supported on %s", runtime.GOOS)
	}
}

// StubFolderPicker is an in-memory test adapter for headless CI environments.
type StubFolderPicker struct {
	Path      string
	Cancelled bool
	Err       error
}

func (s *StubFolderPicker) PickFolder(ctx context.Context) (string, bool, error) {
	return s.Path, s.Cancelled, s.Err
}

//go:build windows

package lsp

import (
	"errors"
	"os"
	"os/exec"
	"syscall"
)

// setProcessGroup configures Windows process creation attributes.
func setProcessGroup(cmd *exec.Cmd) {
	// Windows process trees do not use Setpgid
}

// killProcessGroup terminates the process on Windows.
func killProcessGroup(pid int, sig syscall.Signal) error {
	if pid <= 0 {
		return errors.New("invalid process group pid")
	}
	p, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	return p.Kill()
}

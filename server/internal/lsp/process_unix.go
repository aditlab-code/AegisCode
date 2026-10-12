//go:build !windows

package lsp

import (
	"errors"
	"os/exec"
	"syscall"
)

// setProcessGroup configures the process to be a new process group leader.
func setProcessGroup(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	} else {
		cmd.SysProcAttr.Setpgid = true
	}
}

// killProcessGroup sends a signal to the entire process group (-pid).
func killProcessGroup(pid int, sig syscall.Signal) error {
	if pid <= 0 {
		return errors.New("invalid process group pid")
	}
	return syscall.Kill(-pid, sig)
}

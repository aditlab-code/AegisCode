//go:build !windows

package debug

import (
	"errors"
	"os/exec"
	"syscall"
)

// setProcessGroup sets Setsid or Setpgid so that Delve and its child process run in their own process group.
func setProcessGroup(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = true
}

// terminateProcessGroup sends SIGTERM to the process group.
func terminateProcessGroup(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil || cmd.Process.Pid <= 0 {
		return errors.New("invalid process")
	}
	return syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
}

// killProcessGroup sends SIGKILL to the process group.
func killProcessGroup(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil || cmd.Process.Pid <= 0 {
		return errors.New("invalid process")
	}
	return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
}

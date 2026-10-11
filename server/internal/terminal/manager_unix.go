//go:build !windows

package terminal

import (
	"errors"
	"os/exec"
	"syscall"
)

// setProcessGroup ensures process attributes are properly initialized.
// Note: github.com/creack/pty StartWithSize internally sets Setsid: true and Setctty: true,
// making the child process the leader of its own session and process group (pgid == pid).
// Setting Setpgid: true concurrently would conflict with Setsid and return EPERM.
func setProcessGroup(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
}

// killProcessGroup sends a signal to the entire process group (-pid).
func killProcessGroup(pid int, sig syscall.Signal) error {
	if pid <= 0 {
		return errors.New("invalid process group pid")
	}
	return syscall.Kill(-pid, sig)
}

//go:build windows

package debug

import (
	"errors"
	"os/exec"
)

// setProcessGroup configures Windows process creation attributes.
func setProcessGroup(cmd *exec.Cmd) {
	// Windows process trees do not use Setpgid
}

// terminateProcessGroup gracefully requests process termination on Windows.
func terminateProcessGroup(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return errors.New("invalid process")
	}
	return cmd.Process.Kill()
}

// killProcessGroup forcefully kills the process on Windows.
func killProcessGroup(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return errors.New("invalid process")
	}
	return cmd.Process.Kill()
}

//go:build windows

package terminal

import (
	"os"
	"os/exec"
	"syscall"
)

// setProcessGroup configures Windows process creation attributes if needed.
func setProcessGroup(cmd *exec.Cmd) {
	// Windows process trees do not use Setpgid
}

// killProcessGroup terminates the process on Windows.
func killProcessGroup(pid int, sig syscall.Signal) error {
	p, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	return p.Kill()
}

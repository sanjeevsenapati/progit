//go:build unix

package git

import (
	"os/exec"
	"syscall"
	"time"
)

// ConfigureGitCmd places the git subprocess in its own process group so that
// context cancellation or timeouts terminate git and all spawned helper children
// cleanly without leaving orphaned processes behind.
func ConfigureGitCmd(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.WaitDelay = 5 * time.Second
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}
		if err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL); err != nil {
			return cmd.Process.Kill()
		}
		return nil
	}
}


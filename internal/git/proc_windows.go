//go:build windows

package git

import (
	"os/exec"
	"time"
)

// ConfigureGitCmd configures graceful WaitDelay bounds for git subprocesses on Windows.
func ConfigureGitCmd(cmd *exec.Cmd) {
	cmd.WaitDelay = 5 * time.Second
}


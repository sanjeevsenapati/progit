//go:build unix

package git

import (
	"bytes"
	"context"
	"os/exec"
	"testing"
	"time"
)

func TestConfigureGitCmdSetsProcessGroupAndKillsDescendants(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	// Spawn a shell that forks a background child inheriting stdout/stderr.
	// Without process-group kill, killing only the shell would leave the background
	// sleeper holding the pipe open for the full 10 seconds.
	cmd := exec.CommandContext(ctx, "sh", "-c", "sleep 10 & wait")
	ConfigureGitCmd(cmd)

	if cmd.SysProcAttr == nil || !cmd.SysProcAttr.Setpgid {
		t.Fatalf("expected ConfigureGitCmd to enable Setpgid")
	}
	if cmd.WaitDelay <= 0 {
		t.Fatalf("expected positive WaitDelay, got %v", cmd.WaitDelay)
	}
	if cmd.Cancel == nil {
		t.Fatalf("expected ConfigureGitCmd to configure Cancel")
	}

	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out

	start := time.Now()
	err := cmd.Run()
	elapsed := time.Since(start)

	if err == nil {
		t.Fatalf("expected error after context cancellation, got nil")
	}
	if elapsed > 2*time.Second {
		t.Fatalf("process group cancellation took too long (%v); background child may have leaked", elapsed)
	}
}


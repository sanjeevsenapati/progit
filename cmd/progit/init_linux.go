//go:build linux

package main

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
)

// maybeReapPID1 ensures that when progit runs as PID 1 directly inside a container
// without an init daemon (such as tini), PID 1 acts as an orphan zombie reaper
// while running the actual progit server as child PID 2+.
func maybeReapPID1() {
	if os.Getpid() != 1 || os.Getenv("PROGIT_INIT_CHILD") == "1" {
		return
	}

	exe, err := os.Executable()
	if err != nil {
		exe = os.Args[0]
	}

	sigCh := make(chan os.Signal, 64)
	signal.Notify(
		sigCh,
		syscall.SIGCHLD,
		syscall.SIGTERM,
		syscall.SIGINT,
		syscall.SIGHUP,
		syscall.SIGQUIT,
		syscall.SIGUSR1,
		syscall.SIGUSR2,
	)

	cmd := exec.Command(exe, os.Args[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = append(os.Environ(), "PROGIT_INIT_CHILD=1")

	if err := cmd.Start(); err != nil {
		signal.Stop(sigCh)
		fmt.Fprintf(os.Stderr, "[ProGit Init] failed to spawn child process: %v\n", err)
		return
	}

	childPid := cmd.Process.Pid
	exitCode := 0
	childExited := false

	reapAll := func() {
		for {
			var ws syscall.WaitStatus
			wpid, werr := syscall.Wait4(-1, &ws, syscall.WNOHANG, nil)
			if werr == syscall.EINTR {
				continue
			}
			if wpid <= 0 || werr != nil {
				break
			}
			if wpid == childPid {
				if ws.Exited() {
					exitCode = ws.ExitStatus()
				} else if ws.Signaled() {
					exitCode = 128 + int(ws.Signal())
				}
				childExited = true
			}
		}
	}

	reapAll()
	for !childExited {
		sig := <-sigCh
		if sig == syscall.SIGCHLD {
			reapAll()
			continue
		}
		if s, ok := sig.(syscall.Signal); ok {
			_ = syscall.Kill(childPid, s)
		}
	}

	_ = cmd.Process.Release()
	os.Exit(exitCode)
}


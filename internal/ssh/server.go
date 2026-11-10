package ssh

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	gossh "golang.org/x/crypto/ssh"
	"progit.io/progit/internal/config"
	"progit.io/progit/internal/database"
	"progit.io/progit/internal/git"
)

type Server struct {
	cfg        *config.Config
	sshConfig  *gossh.ServerConfig
	listener   net.Listener
	stopChan   chan struct{}
}

func StartServer(cfg *config.Config) (*Server, error) {
	if !cfg.SSH.Enabled {
		return nil, nil
	}

	hostKey, err := loadOrGenerateHostKey(cfg.SSH.KeyPath)
	if err != nil {
		return nil, fmt.Errorf("load host key: %w", err)
	}

	sshConfig := &gossh.ServerConfig{
		PublicKeyCallback: func(conn gossh.ConnMetadata, key gossh.PublicKey) (*gossh.Permissions, error) {
			fingerprint := gossh.FingerprintSHA256(key)
			_, user, err := database.GetSSHKeyByFingerprint(fingerprint)
			if err != nil || user == nil {
				return nil, fmt.Errorf("unauthorized key fingerprint: %s", fingerprint)
			}
			return &gossh.Permissions{
				Extensions: map[string]string{
					"user_id":  fmt.Sprintf("%d", user.ID),
					"username": user.Username,
				},
			}, nil
		},
	}
	sshConfig.AddHostKey(hostKey)

	listenAddr := fmt.Sprintf("%s:%d", cfg.SSH.ListenHost, cfg.SSH.Port)
	listener, err := net.Listen("tcp", listenAddr)
	if err != nil {
		return nil, fmt.Errorf("listen on %s: %w", listenAddr, err)
	}

	srv := &Server{
		cfg:       cfg,
		sshConfig: sshConfig,
		listener:  listener,
		stopChan:  make(chan struct{}),
	}

	go srv.listenLoop()
	return srv, nil
}

func (s *Server) Close() error {
	close(s.stopChan)
	if s.listener != nil {
		return s.listener.Close()
	}
	return nil
}

func (s *Server) listenLoop() {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			select {
			case <-s.stopChan:
				return
			default:
				continue
			}
		}
		go s.handleConnection(conn)
	}
}

func (s *Server) handleConnection(nConn net.Conn) {
	conn, chans, reqs, err := gossh.NewServerConn(nConn, s.sshConfig)
	if err != nil {
		_ = nConn.Close()
		return
	}
	defer conn.Close()

	go gossh.DiscardRequests(reqs)

	for newChannel := range chans {
		if newChannel.ChannelType() != "session" {
			_ = newChannel.Reject(gossh.UnknownChannelType, "unknown channel type")
			continue
		}

		channel, requests, err := newChannel.Accept()
		if err != nil {
			return
		}

		go s.handleSession(channel, requests, conn.Permissions)
	}
}

func (s *Server) handleSession(channel gossh.Channel, requests <-chan *gossh.Request, perms *gossh.Permissions) {
	defer channel.Close()

	username := "user"
	if perms != nil && perms.Extensions["username"] != "" {
		username = perms.Extensions["username"]
	}

	for req := range requests {
		switch req.Type {
		case "exec":
			cmdStr := string(req.Payload)
			// Payload has 4-byte length prefix in SSH exec packets
			if len(cmdStr) > 4 {
				cmdStr = cmdStr[4:]
			}
			cmdTrimmed := strings.TrimSpace(cmdStr)
			if cmdTrimmed == "" || cmdTrimmed == "whoami" || (!strings.HasPrefix(cmdTrimmed, "git-upload-pack") && !strings.HasPrefix(cmdTrimmed, "git-receive-pack")) {
				_ = req.Reply(true, nil)
				msg := fmt.Sprintf("\nHi %s! You've successfully authenticated over SSH, but ProGit does not provide interactive shell access.\nConnection to %s closed.\n\n", username, s.cfg.Server.Domain)
				_, _ = channel.Write([]byte(msg))
				status := struct{ Status uint32 }{Status: 0}
				_, _ = channel.SendRequest("exit-status", false, gossh.Marshal(&status))
				return
			}
			s.executeGitCommand(channel, req, cmdStr, perms)
			return
		case "pty-req":
			_ = req.Reply(true, nil)
		case "shell":
			_ = req.Reply(true, nil)
			msg := fmt.Sprintf("\nHi %s! You've successfully authenticated over SSH, but ProGit does not provide interactive shell access.\nConnection to %s closed.\n\n", username, s.cfg.Server.Domain)
			_, _ = channel.Write([]byte(msg))
			status := struct{ Status uint32 }{Status: 0}
			_, _ = channel.SendRequest("exit-status", false, gossh.Marshal(&status))
			return
		case "env":
			_ = req.Reply(true, nil)
		default:
			_ = req.Reply(false, nil)
		}
	}
}

func (s *Server) executeGitCommand(channel gossh.Channel, req *gossh.Request, rawCommand string, perms *gossh.Permissions) {
	parts := strings.SplitN(strings.TrimSpace(rawCommand), " ", 2)
	if len(parts) != 2 {
		_ = req.Reply(false, nil)
		return
	}

	action := parts[0]
	repoArg := strings.Trim(parts[1], "'\"/")
	repoArg = strings.TrimSuffix(repoArg, ".git")

	pathParts := strings.Split(repoArg, "/")
	if len(pathParts) != 2 {
		_ = req.Reply(false, nil)
		return
	}
	ownerName, repoName := pathParts[0], pathParts[1]
	isWiki := strings.HasSuffix(repoName, ".wiki")
	cleanRepoName := strings.TrimSuffix(repoName, ".wiki")

	repo, err := database.GetRepositoryByName(ownerName, cleanRepoName)
	if err != nil {
		_, _ = channel.Stderr().Write([]byte("Repository not found\n"))
		_ = req.Reply(false, nil)
		return
	}

	var authUser *database.User
	if perms != nil && perms.Extensions["username"] != "" {
		authUser, _ = database.GetUserByUsername(perms.Extensions["username"])
	}

	isWrite := action == "git-receive-pack"
	if isWrite && repo.IsArchived {
		_, _ = channel.Stderr().Write([]byte("Repository is archived and read-only\n"))
		_ = req.Reply(false, nil)
		return
	}
	if !database.CanUserAccessRepo(authUser, repo, isWrite) {
		_, _ = channel.Stderr().Write([]byte("Access denied to repository\n"))
		_ = req.Reply(false, nil)
		return
	}

	var repoPath string
	if isWiki {
		repoPath = filepath.Join(s.cfg.Repository.Root, ownerName, cleanRepoName+".wiki.git")
		if _, err := os.Stat(repoPath); os.IsNotExist(err) {
			_ = git.InitWikiRepository(repoPath, repo.Name, "ProGit", "wiki@progit.io")
		}
	} else {
		repoPath = filepath.Join(s.cfg.Repository.Root, ownerName, cleanRepoName+".git")
	}

	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		_, _ = channel.Stderr().Write([]byte("Repository storage not found\n"))
		_ = req.Reply(false, nil)
		return
	}

	var gitService string
	switch action {
	case "git-upload-pack":
		gitService = "upload-pack"
	case "git-receive-pack":
		gitService = "receive-pack"
	default:
		_ = req.Reply(false, nil)
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		select {
		case <-s.stopChan:
			cancel()
		case <-ctx.Done():
		}
	}()

	cmd := exec.CommandContext(ctx, "git", "-c", "maintenance.autoDetach=false", "-c", "gc.autoDetach=false", gitService, repoPath)
	git.ConfigureGitCmd(cmd)
	cmd.Dir = repoPath

	stdin, err := cmd.StdinPipe()
	if err != nil {
		_ = req.Reply(false, nil)
		return
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		_ = req.Reply(false, nil)
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		_ = stdin.Close()
		_ = stdout.Close()
		_ = req.Reply(false, nil)
		return
	}

	if err := cmd.Start(); err != nil {
		_ = req.Reply(false, nil)
		return
	}

	_ = req.Reply(true, nil)

	go func() {
		_, _ = io.Copy(stdin, channel)
		_ = stdin.Close()
	}()

	var ioWg sync.WaitGroup
	ioWg.Add(2)
	go func() {
		defer ioWg.Done()
		if _, err := io.Copy(channel, stdout); err != nil {
			cancel()
		}
	}()
	go func() {
		defer ioWg.Done()
		if _, err := io.Copy(channel.Stderr(), stderr); err != nil {
			cancel()
		}
	}()

	ioWg.Wait()
	_ = cmd.Wait()

	if isWrite {
		rootURL := strings.TrimRight(s.cfg.Server.RootURL, "/")
		prMsg := fmt.Sprintf("\nremote: \nremote: To create a pull request on ProGit, visit:\nremote:   %s/%s/%s/pulls/new\nremote: \n", rootURL, ownerName, cleanRepoName)
		_, _ = channel.Stderr().Write([]byte(prMsg))
	}

	status := struct{ Status uint32 }{Status: 0}
	if cmd.ProcessState != nil && !cmd.ProcessState.Success() {
		status.Status = 1
	}
	if cmd.ProcessState != nil && cmd.ProcessState.Success() && gitService == "receive-pack" && authUser != nil && repo != nil {
		_, _ = database.DB.Exec(`UPDATE repositories SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, repo.ID)
		database.CreateActivity(authUser.ID, authUser.Username, &repo.ID, repo.Name, "push", fmt.Sprintf("Pushed commits to %s/%s via SSH", repo.OwnerName, repo.Name))
		database.DispatchRepoWebhooks(repo.ID, "push", map[string]any{
			"repository": repo,
			"pusher": map[string]string{
				"name":  authUser.Username,
				"email": authUser.Email,
			},
			"sender": authUser,
		})
	}
	_, _ = channel.SendRequest("exit-status", false, gossh.Marshal(&status))
}

func loadOrGenerateHostKey(keyPath string) (gossh.Signer, error) {
	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		if err := os.MkdirAll(filepath.Dir(keyPath), 0700); err != nil {
			return nil, err
		}
		_, priv, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			return nil, err
		}
		pemBlock, err := gossh.MarshalPrivateKey(priv, "")
		if err != nil {
			return nil, err
		}
		keyBytes := pem.EncodeToMemory(pemBlock)
		if err := os.WriteFile(keyPath, keyBytes, 0600); err != nil {
			return nil, err
		}
		log.Printf("[SSH] Generated new host ed25519 key at %s", keyPath)
	}

	keyData, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, err
	}
	return gossh.ParsePrivateKey(keyData)
}


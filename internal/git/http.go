package git

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"progit.io/progit/internal/config"
	"progit.io/progit/internal/database"
)

// HandleSmartHTTP handles Git Smart HTTP requests: /info/refs, /git-upload-pack, /git-receive-pack
func HandleSmartHTTP(w http.ResponseWriter, r *http.Request, cfg *config.Config) bool {
	path := r.URL.Path
	if !strings.Contains(path, ".git") {
		return false
	}

	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 3 {
		return false
	}

	ownerName := parts[0]
	repoPart := parts[1]
	isWiki := strings.HasSuffix(repoPart, ".wiki.git")
	repoName := strings.TrimSuffix(strings.TrimSuffix(repoPart, ".git"), ".wiki")
	action := strings.Join(parts[2:], "/")

	repo, err := database.GetRepositoryByName(ownerName, repoName)
	if err != nil {
		http.NotFound(w, r)
		return true
	}

	var repoPath string
	if isWiki {
		repoPath = filepath.Join(cfg.Repository.Root, ownerName, repoName+".wiki.git")
		if _, err := os.Stat(repoPath); os.IsNotExist(err) {
			_ = InitWikiRepository(repoPath, repo.Name, "ProGit", "wiki@progit.io")
		}
	} else {
		repoPath = filepath.Join(cfg.Repository.Root, ownerName, repoName+".git")
	}

	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		http.NotFound(w, r)
		return true
	}

	isPull := true
	if action == "git-receive-pack" || r.URL.Query().Get("service") == "git-receive-pack" {
		isPull = false
	}

	if !isPull && repo.IsArchived {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte("Repository is archived and read-only"))
		return true
	}

	// Authenticate user and verify access/download permissions
	authUser, hasAuth := authenticateHTTPBasic(r)
	perms := database.GetRepoPermissions(authUser, repo)
	if !isPull {
		if !hasAuth {
			askBasicAuth(w)
			return true
		}
		if !perms.Write {
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte("Access denied to repository"))
			return true
		}
	} else {
		if !perms.Read {
			if !hasAuth {
				askBasicAuth(w)
				return true
			}
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte("Access denied to repository"))
			return true
		}
		if !perms.Download {
			if !hasAuth {
				askBasicAuth(w)
				return true
			}
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte("Repository download and git clone/pull are restricted for your account or this repository"))
			return true
		}
	}

	switch {
	case action == "info/refs":
		service := r.URL.Query().Get("service")
		if service != "git-upload-pack" && service != "git-receive-pack" {
			http.Error(w, "Unsupported service", http.StatusBadRequest)
			return true
		}
		serveInfoRefs(w, r, repoPath, service)
		return true

	case action == "git-upload-pack":
		serveRPC(w, r, repoPath, "upload-pack", authUser, repo)
		return true

	case action == "git-receive-pack":
		serveRPC(w, r, repoPath, "receive-pack", authUser, repo)
		return true

	case action == "HEAD":
		w.Header().Set("Content-Type", "text/plain")
		http.ServeFile(w, r, filepath.Join(repoPath, "HEAD"))
		return true

	default:
		return false
	}
}

func askBasicAuth(w http.ResponseWriter) {
	w.Header().Set("WWW-Authenticate", `Basic realm="ProGit"`)
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte("Authentication required\n"))
}

func authenticateHTTPBasic(r *http.Request) (*database.User, bool) {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Basic ") {
		return nil, false
	}

	payload, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(authHeader, "Basic "))
	if err != nil {
		return nil, false
	}

	pair := strings.SplitN(string(payload), ":", 2)
	if len(pair) != 2 {
		return nil, false
	}

	username, passwordOrToken := pair[0], pair[1]

	// 1. Try personal access token via username or password
	if user, err := database.GetUserByAccessToken(passwordOrToken); err == nil && user != nil {
		return user, true
	}
	if user, err := database.GetUserByAccessToken(username); err == nil && user != nil {
		return user, true
	}

	// 2. Try regular user password
	user, err := database.GetUserByUsername(username)
	if err != nil || user == nil {
		return nil, false
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(passwordOrToken)); err == nil {
		return user, true
	}

	return nil, false
}

func packetWrite(str string) []byte {
	length := len(str) + 4
	s := strconv.FormatInt(int64(length), 16)
	if len(s)%4 != 0 {
		s = strings.Repeat("0", 4-len(s)%4) + s
	}
	return []byte(s + str)
}

func serveInfoRefs(w http.ResponseWriter, r *http.Request, repoPath, service string) {
	serviceClean := strings.TrimPrefix(service, "git-")

	cmd := exec.CommandContext(r.Context(), "git", "-c", "maintenance.autoDetach=false", "-c", "gc.autoDetach=false", serviceClean, "--stateless-rpc", "--advertise-refs", ".")
	ConfigureGitCmd(cmd)
	cmd.Dir = repoPath
	out, err := cmd.Output()
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to advertise refs: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", fmt.Sprintf("application/x-git-%s-advertisement", serviceClean))
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)

	_, _ = w.Write(packetWrite(fmt.Sprintf("# service=%s\n", service)))
	_, _ = w.Write([]byte("0000"))
	_, _ = w.Write(out)
}

func serveRPC(w http.ResponseWriter, r *http.Request, repoPath, service string, authUser *database.User, repo *database.Repository) {
	defer r.Body.Close()

	var reqBody io.Reader = r.Body
	if r.Header.Get("Content-Encoding") == "gzip" {
		gzReader, err := gzip.NewReader(r.Body)
		if err != nil {
			http.Error(w, "Failed to read gzip body", http.StatusInternalServerError)
			return
		}
		defer gzReader.Close()
		reqBody = gzReader
	}

	w.Header().Set("Content-Type", fmt.Sprintf("application/x-git-%s-result", service))
	w.Header().Set("Cache-Control", "no-cache")

	var stderr bytes.Buffer
	cmd := exec.CommandContext(r.Context(), "git", "-c", "maintenance.autoDetach=false", "-c", "gc.autoDetach=false", service, "--stateless-rpc", repoPath)
	ConfigureGitCmd(cmd)
	cmd.Dir = repoPath
	cmd.Stdin = reqBody
	cmd.Stdout = w
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return
	}

	if service == "receive-pack" && authUser != nil && repo != nil {
		// Pushed successfully: update repo timestamp & record activity
		_, _ = database.DB.Exec(`UPDATE repositories SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, repo.ID)
		database.CreateActivity(authUser.ID, authUser.Username, &repo.ID, repo.Name, "push", fmt.Sprintf("Pushed commits to %s/%s", repo.OwnerName, repo.Name))
		database.DispatchRepoWebhooks(repo.ID, "push", map[string]any{
			"repository": repo,
			"pusher": map[string]string{
				"name":  authUser.Username,
				"email": authUser.Email,
			},
			"sender": authUser,
		})
	}
}


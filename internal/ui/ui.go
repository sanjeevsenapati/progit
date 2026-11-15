package ui

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

//go:embed all:dist
var embeddedFS embed.FS

// Handler serves SPA assets from embedded FS or disk fallback.
func Handler(diskDir string) http.HandlerFunc {
	distSub, err := fs.Sub(embeddedFS, "dist")
	useEmbedded := err == nil

	return func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasSuffix(r.URL.Path, ".git") || strings.Contains(r.URL.Path, ".git/") {
			http.NotFound(w, r)
			return
		}

		cleanPath := strings.TrimPrefix(filepath.Clean("/"+r.URL.Path), "/")
		if cleanPath == "" || cleanPath == "." {
			cleanPath = "index.html"
		}

		if useEmbedded {
			f, err := distSub.Open(cleanPath)
			if err == nil {
				_ = f.Close()
				http.FileServer(http.FS(distSub)).ServeHTTP(w, r)
				return
			}

			indexFile, err := distSub.Open("index.html")
			if err == nil {
				defer indexFile.Close()
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.WriteHeader(http.StatusOK)
				_, _ = io.Copy(w, indexFile)
				return
			}
		}

		targetPath := filepath.Join(diskDir, cleanPath)
		fi, err := os.Stat(targetPath)
		if err == nil && !fi.IsDir() {
			http.ServeFile(w, r, targetPath)
			return
		}

		indexPath := filepath.Join(diskDir, "index.html")
		if _, err := os.Stat(indexPath); err == nil {
			http.ServeFile(w, r, indexPath)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `<!DOCTYPE html><html><head><title>ProGit</title></head><body><h1>ProGit</h1><p><a href="/api/health">/api/health</a></p></body></html>`)
	}
}

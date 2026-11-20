import React, { useEffect, useMemo, useState } from 'react';
import { Code2, Download, Plus, Search, Tag, Trash2, Upload } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';

export interface Snippet {
  id: string;
  title: string;
  language: string;
  tags: string[];
  code: string;
  updatedAt: string;
}

const STORAGE_KEY = 'progit_toolbox_snippets';

const DEFAULT_SNIPPETS: Snippet[] = [
  {
    id: 'snip-1',
    title: 'Go HTTP Server with Graceful Shutdown',
    language: 'go',
    tags: ['backend', 'http', 'server'],
    updatedAt: '2026-11-20',
    code: `package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	srv := &http.Server{
		Addr:         ":8080",
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}`,
  },
  {
    id: 'snip-2',
    title: 'Docker Multi-Stage Go Build',
    language: 'docker',
    tags: ['docker', 'container', 'go'],
    updatedAt: '2026-11-20',
    code: `# syntax=docker/dockerfile:1
FROM golang:1.24-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /bin/app ./cmd/app

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
USER 10001:10001
COPY --from=builder /bin/app /bin/app
EXPOSE 8080
ENTRYPOINT ["/bin/app"]`,
  },
  {
    id: 'snip-3',
    title: 'TypeScript React Debounce Hook',
    language: 'typescript',
    tags: ['react', 'hook', 'frontend'],
    updatedAt: '2026-11-20',
    code: `import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(handler);
  }, [value, delayMs]);

  return debouncedValue;
}`,
  },
];

export const CodeSnippetTool: React.FC = () => {
  const [snippets, setSnippets] = useState<Snippet[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return DEFAULT_SNIPPETS;
  });

  const [activeId, setActiveId] = useState<string>(() => snippets[0]?.id || '');
  const [search, setSearch] = useState<string>('');
  const [langFilter, setLangFilter] = useState<string>('all');
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editLang, setEditLang] = useState('typescript');
  const [editTags, setEditTags] = useState('');
  const [editCode, setEditCode] = useState('');

  // Persist snippets to local storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
    } catch {}
  }, [snippets]);

  const activeSnippet = useMemo(() => {
    return snippets.find(s => s.id === activeId) || snippets[0];
  }, [snippets, activeId]);

  const filteredSnippets = useMemo(() => {
    return snippets.filter(s => {
      const matchesLang = langFilter === 'all' || s.language === langFilter;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q)) ||
        s.code.toLowerCase().includes(q);
      return matchesLang && matchesSearch;
    });
  }, [snippets, langFilter, search]);

  const handleStartCreate = () => {
    setIsEditing(true);
    setEditTitle('New Snippet');
    setEditLang('typescript');
    setEditTags('code, helper');
    setEditCode('// Write your reusable code here\n');
  };

  const handleStartEdit = () => {
    if (!activeSnippet) return;
    setIsEditing(true);
    setEditTitle(activeSnippet.title);
    setEditLang(activeSnippet.language);
    setEditTags(activeSnippet.tags.join(', '));
    setEditCode(activeSnippet.code);
  };

  const handleSaveSnippet = () => {
    if (!editTitle.trim()) return;
    const tagArray = editTags.split(',').map(t => t.trim()).filter(Boolean);

    if (isEditing && activeSnippet && editTitle === activeSnippet.title) {
      // Update existing
      setSnippets(prev =>
        prev.map(s =>
          s.id === activeSnippet.id
            ? { ...s, title: editTitle, language: editLang, tags: tagArray, code: editCode, updatedAt: new Date().toISOString().split('T')[0] }
            : s
        )
      );
    } else {
      // Create new
      const newSnippet: Snippet = {
        id: `snip-${Date.now()}`,
        title: editTitle,
        language: editLang,
        tags: tagArray,
        code: editCode,
        updatedAt: new Date().toISOString().split('T')[0],
      };
      setSnippets(prev => [newSnippet, ...prev]);
      setActiveId(newSnippet.id);
    }
    setIsEditing(false);
  };

  const handleDelete = (id: string) => {
    setSnippets(prev => prev.filter(s => s.id !== id));
    if (activeId === id) {
      const remaining = snippets.filter(s => s.id !== id);
      setActiveId(remaining[0]?.id || '');
    }
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(snippets, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute('href', dataStr);
    dl.setAttribute('download', 'progit-snippets-backup.json');
    dl.click();
  };

  return (
    <div className="space-y-4">
      {/* Search and Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs">
          <button
            type="button"
            onClick={handleStartCreate}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Snippet</span>
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 text-xs"
          >
            <Download className="w-3.5 h-3.5 text-sky-500" />
            <span>Export JSON</span>
          </button>
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search snippets or tags..."
            className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Snippet List */}
        <div className="lg:col-span-4 space-y-2 max-h-[540px] overflow-y-auto pr-1">
          {filteredSnippets.map(s => (
            <div
              key={s.id}
              onClick={() => {
                setActiveId(s.id);
                setIsEditing(false);
              }}
              className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                activeId === s.id && !isEditing
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-gray-800 dark:text-dark-text truncate">{s.title}</span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-border text-gray-600 dark:text-dark-muted">
                  {s.language}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {s.tags.map(t => (
                  <span key={t} className="text-[10px] text-gray-500 dark:text-dark-muted bg-gray-100 dark:bg-dark-border/40 px-1.5 py-0.2 rounded">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {filteredSnippets.length === 0 && (
            <p className="text-xs text-gray-400 p-4 text-center">No snippets found.</p>
          )}
        </div>

        {/* Right Code Display / Editor */}
        <div className="lg:col-span-8">
          {isEditing ? (
            <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3">
              <h3 className="text-xs font-bold text-gray-700 dark:text-dark-text uppercase tracking-wider">
                {activeSnippet ? 'Edit Snippet' : 'Create Snippet'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="Snippet Title"
                  className="p-2 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg font-semibold"
                />
                <input
                  type="text"
                  value={editTags}
                  onChange={e => setEditTags(e.target.value)}
                  placeholder="Tags (comma separated: go, api)"
                  className="p-2 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg"
                />
              </div>

              <textarea
                value={editCode}
                onChange={e => setEditCode(e.target.value)}
                rows={16}
                className="w-full font-mono text-xs p-3 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-900 text-emerald-400 focus:outline-none"
                placeholder="Paste or write code snippet..."
              />

              <div className="flex items-center justify-end space-x-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSnippet}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold"
                >
                  Save Snippet
                </button>
              </div>
            </div>
          ) : activeSnippet ? (
            <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-dark-text">{activeSnippet.title}</h3>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">
                      {activeSnippet.language}
                    </span>
                    <span className="text-xs text-gray-400">Updated {activeSnippet.updatedAt}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <CopyButton value={activeSnippet.code} label="Copy Snippet" />
                  <button
                    type="button"
                    onClick={() => handleDelete(activeSnippet.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                    title="Delete Snippet"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <pre className="p-3.5 rounded-lg bg-gray-900 text-gray-100 font-mono text-xs overflow-x-auto leading-relaxed border border-gray-800">
                <code>{activeSnippet.code}</code>
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default CodeSnippetTool;

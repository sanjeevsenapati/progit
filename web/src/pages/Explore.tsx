import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api, Repository } from '../lib/api';
import { Compass, GitBranch, Star, Search, Lock, BookOpen, Loader2, X, GitFork } from 'lucide-react';

export const Explore: React.FC = () => {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('q') || '';
  });
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch repositories from API
  const performSearch = useCallback(async (query: string) => {
    try {
      setLoading(true);
      const data = await api.explore(query.trim());
      setRepos(data.repositories || []);
    } catch (err) {
      console.error('Failed to search repositories:', err);
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Synchronize on mount and handle popstate (browser back/forward)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialQ = params.get('q') || '';
    performSearch(initialQ);

    const onPopState = () => {
      const q = new URLSearchParams(window.location.search).get('q') || '';
      setSearchQuery(q);
      performSearch(q);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [performSearch]);

  // Handle user typing with debounce
  const handleQueryChange = (val: string) => {
    setSearchQuery(val);
    const trimmed = val.trim();

    // Update browser URL query string without page reload
    const url = new URL(window.location.href);
    if (trimmed) {
      url.searchParams.set('q', trimmed);
    } else {
      url.searchParams.delete('q');
    }
    window.history.replaceState({}, '', url.toString());

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      performSearch(trimmed);
    }, 250);
  };

  // Immediate search on submit
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    performSearch(searchQuery.trim());
  };

  const handleClear = () => {
    setSearchQuery('');
    const url = new URL(window.location.href);
    url.searchParams.delete('q');
    window.history.replaceState({}, '', url.toString());
    if (debounceRef.current) clearTimeout(debounceRef.current);
    performSearch('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-dark-border pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <Compass className="w-6 h-6 mr-2 text-emerald-600 dark:text-emerald-400" />
            Explore Repositories
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-muted mt-1">
            Discover open source code, community projects, and authorized repositories on ProGit.
          </p>
        </div>

        <form onSubmit={handleFormSubmit} className="w-full sm:w-80 relative flex items-center">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </div>
            <input
              type="text"
              placeholder="Search repositories by name, owner, or topic..."
              value={searchQuery}
              onChange={e => handleQueryChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm rounded-lg bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear search"
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-dark-text"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Results Header */}
      {searchQuery.trim() && (
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-dark-muted px-1">
          <span>
            {loading ? 'Searching repositories...' : `Found ${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'} matching "${searchQuery.trim()}"`}
          </span>
          <button
            onClick={handleClear}
            className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Repositories Grid */}
      {loading && repos.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <p>Searching ProGit repositories...</p>
        </div>
      ) : repos.length === 0 ? (
        <div className="py-16 text-center text-gray-500 dark:text-dark-muted space-y-3 bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border p-8 shadow-xs">
          <BookOpen className="w-12 h-12 mx-auto text-gray-400" />
          <p className="font-semibold text-base text-gray-900 dark:text-white">
            {searchQuery.trim() ? `No repositories matching "${searchQuery.trim()}"` : 'No public repositories found'}
          </p>
          <p className="text-xs max-w-sm mx-auto">
            {searchQuery.trim()
              ? 'Try checking for typos or searching for a broader term.'
              : 'Be the first to share your code publicly on ProGit.'}
          </p>
          {searchQuery.trim() ? (
            <button
              onClick={handleClear}
              className="mt-2 inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              Clear search filter
            </button>
          ) : (
            <a
              href="/new"
              className="mt-2 inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              Create repository
            </a>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {repos.map(repo => (
            <div
              key={repo.id}
              className="p-5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-emerald-500/50 dark:hover:border-emerald-500/50 transition-all shadow-xs space-y-3 group"
            >
              <div className="flex items-start justify-between">
                <a
                  href={`/${repo.owner_name}/${repo.name}`}
                  className="text-base font-bold text-emerald-600 dark:text-emerald-400 group-hover:underline flex items-center space-x-1.5"
                >
                  <GitBranch className="w-4 h-4 flex-shrink-0" />
                  <span>{repo.owner_name} / {repo.name}</span>
                </a>
                {repo.is_private ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-500 bg-amber-500/10 flex items-center space-x-1 font-medium">
                    <Lock className="w-3 h-3" />
                    <span>Private</span>
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 dark:border-dark-border text-gray-500 dark:text-dark-muted font-medium">
                    Public
                  </span>
                )}
              </div>

              {repo.is_fork && (
                <div className="flex items-center space-x-1 text-[11px] text-gray-400">
                  <GitFork className="w-3 h-3" />
                  <span>Forked repository</span>
                </div>
              )}

              <p className="text-xs text-gray-600 dark:text-dark-muted line-clamp-2">
                {repo.description || 'No description provided.'}
              </p>

              <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-dark-muted pt-2 border-t border-gray-100 dark:border-dark-border">
                <span className="flex items-center">
                  <Star className="w-3.5 h-3.5 mr-1 fill-amber-400 text-amber-400" />
                  {repo.num_stars}
                </span>
                <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

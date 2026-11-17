import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api, Repository } from '../lib/api';
import { Compass, GitBranch, Star, Search, Lock, BookOpen, Loader2, X, GitFork, ChevronLeft, ChevronRight } from 'lucide-react';

export const Explore: React.FC = () => {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('q') || '';
  });
  const [currentPage, setCurrentPage] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const p = parseInt(params.get('page') || '1', 10);
    return p > 0 ? p : 1;
  });
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pageSize = 12;

  // Helper to update URL query params
  const updateUrl = (q: string, p: number) => {
    const url = new URL(window.location.href);
    const trimmed = q.trim();
    if (trimmed) {
      url.searchParams.set('q', trimmed);
    } else {
      url.searchParams.delete('q');
    }
    if (p > 1) {
      url.searchParams.set('page', String(p));
    } else {
      url.searchParams.delete('page');
    }
    window.history.replaceState({}, '', url.toString());
  };

  // Fetch repositories from API
  const performSearch = useCallback(async (query: string, pageNum: number = 1) => {
    try {
      setLoading(true);
      const data = await api.explore(query.trim(), pageNum, pageSize);
      setRepos(data.repositories || []);
      const total = data.total ?? (data.repositories ? data.repositories.length : 0);
      setTotalCount(total);
      setTotalPages(data.total_pages || (total > 0 ? Math.ceil(total / pageSize) : 1));
      setCurrentPage(pageNum);
    } catch (err) {
      console.error('Failed to search repositories:', err);
      setRepos([]);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  // Synchronize on mount and handle popstate (browser back/forward)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialQ = params.get('q') || '';
    const initialP = parseInt(params.get('page') || '1', 10);
    performSearch(initialQ, initialP > 0 ? initialP : 1);

    const onPopState = () => {
      const q = new URLSearchParams(window.location.search).get('q') || '';
      const p = parseInt(new URLSearchParams(window.location.search).get('page') || '1', 10);
      setSearchQuery(q);
      performSearch(q, p > 0 ? p : 1);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [performSearch]);

  // Handle user typing with debounce (resets to page 1)
  const handleQueryChange = (val: string) => {
    setSearchQuery(val);
    const trimmed = val.trim();
    updateUrl(trimmed, 1);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      performSearch(trimmed, 1);
    }, 250);
  };

  // Immediate search on submit
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updateUrl(searchQuery, 1);
    performSearch(searchQuery.trim(), 1);
  };

  const handleClear = () => {
    setSearchQuery('');
    updateUrl('', 1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    performSearch('', 1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
    updateUrl(searchQuery, newPage);
    performSearch(searchQuery, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-dark-border pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white flex items-center">
            <Compass className="w-7 h-7 mr-2.5 text-emerald-600 dark:text-emerald-400" />
            Explore Repositories
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-dark-muted mt-1.5">
            Discover open source code, community projects, and authorized repositories on ProGit.
          </p>
        </div>

        <form onSubmit={handleFormSubmit} className="w-full sm:w-88 relative flex items-center">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </div>
            <input
              type="text"
              placeholder="Search repositories (e.g. owner/name)..."
              value={searchQuery}
              onChange={e => handleQueryChange(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 text-sm sm:text-base rounded-lg bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear search"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-dark-text"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Results Filter Bar */}
      {searchQuery.trim() && (
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-dark-muted px-1">
          <span>
            {loading ? 'Searching repositories...' : `Found ${totalCount} repositor${totalCount === 1 ? 'y' : 'ies'} matching "${searchQuery.trim()}"`}
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
        <div className="py-20 text-center text-base text-gray-400 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <p>Searching ProGit repositories...</p>
        </div>
      ) : repos.length === 0 ? (
        <div className="py-20 text-center text-gray-500 dark:text-dark-muted space-y-3 bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border p-8 shadow-xs">
          <BookOpen className="w-12 h-12 mx-auto text-gray-400" />
          <p className="font-semibold text-lg text-gray-900 dark:text-white">
            {searchQuery.trim() ? `No repositories matching "${searchQuery.trim()}"` : 'No public repositories found'}
          </p>
          <p className="text-sm max-w-sm mx-auto">
            {searchQuery.trim()
              ? 'Try checking for typos or searching for a broader term.'
              : 'Be the first to share your code publicly on ProGit.'}
          </p>
          {searchQuery.trim() ? (
            <button
              onClick={handleClear}
              className="mt-2 inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              Clear search filter
            </button>
          ) : (
            <a
              href="/new"
              className="mt-2 inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              Create repository
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {repos.map(repo => (
              <div
                key={repo.id}
                className="p-5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-emerald-500/50 dark:hover:border-emerald-500/50 transition-all shadow-xs space-y-3 group"
              >
                <div className="flex items-start justify-between">
                  <a
                    href={`/${repo.owner_name}/${repo.name}`}
                    className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 group-hover:underline flex items-center space-x-2"
                  >
                    <GitBranch className="w-4 h-4 shrink-0" />
                    <span>{repo.owner_name} / {repo.name}</span>
                  </a>
                  {repo.is_private ? (
                    <span className="text-xs px-2.5 py-0.5 rounded-full border border-amber-500/30 text-amber-500 bg-amber-500/10 flex items-center space-x-1 font-medium">
                      <Lock className="w-3 h-3" />
                      <span>Private</span>
                    </span>
                  ) : (
                    <span className="text-xs px-2.5 py-0.5 rounded-full border border-gray-200 dark:border-dark-border text-gray-500 dark:text-dark-muted font-medium">
                      Public
                    </span>
                  )}
                </div>

                {repo.is_fork && (
                  <div className="flex items-center space-x-1.5 text-xs text-gray-400">
                    <GitFork className="w-3.5 h-3.5" />
                    <span>Forked repository</span>
                  </div>
                )}

                <p className="text-sm text-gray-600 dark:text-dark-text line-clamp-2">
                  {repo.description || 'No description provided.'}
                </p>

                <div className="flex items-center space-x-5 text-xs sm:text-sm text-gray-500 dark:text-dark-muted pt-2.5 border-t border-gray-100 dark:border-dark-border">
                  <span className="flex items-center">
                    <Star className="w-4 h-4 mr-1 fill-amber-400 text-amber-400" />
                    {repo.num_stars}
                  </span>
                  <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalCount > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-gray-200 dark:border-dark-border text-sm">
              <div className="text-gray-600 dark:text-dark-muted">
                Showing <span className="font-semibold text-gray-900 dark:text-white">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                <span className="font-semibold text-gray-900 dark:text-white">{Math.min(currentPage * pageSize, totalCount)}</span> of{' '}
                <span className="font-semibold text-gray-900 dark:text-white">{totalCount}</span> repositories
              </div>

              {totalPages > 1 && (
                <div className="flex items-center space-x-1.5 self-center sm:self-auto">
                  {/* Previous Button */}
                  <button
                    type="button"
                    disabled={currentPage <= 1 || loading}
                    onClick={() => handlePageChange(currentPage - 1)}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-medium transition-colors shadow-2xs"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    <span>Previous</span>
                  </button>

                  {/* Page Numbers with ellipsis windowing */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                    .map((p, idx, arr) => (
                      <React.Fragment key={p}>
                        {idx > 0 && arr[idx - 1] !== p - 1 && (
                          <span className="px-1 text-gray-400">…</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handlePageChange(p)}
                          className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                            p === currentPage
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover shadow-2xs'
                          }`}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    ))}

                  {/* Next Button */}
                  <button
                    type="button"
                    disabled={currentPage >= totalPages || loading}
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-medium transition-colors shadow-2xs"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

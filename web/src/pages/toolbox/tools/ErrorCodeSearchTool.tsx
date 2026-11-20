import React, { useMemo, useState } from 'react';
import { BookOpen, CheckCircle, HelpCircle, Search, Terminal } from 'lucide-react';
import { CopyButton } from '../components/ToolUI';
import { ERROR_DATABASE, ErrorEntry } from '../lib/errorCodes';

export const ErrorCodeSearchTool: React.FC = () => {
  const [search, setSearch] = useState<string>('');
  const [category, setCategory] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string>('http-403');

  const filteredErrors = useMemo(() => {
    return ERROR_DATABASE.filter(e => {
      const matchCat = category === 'all' || e.category === category;
      const q = search.toLowerCase();
      const matchQ =
        !q ||
        e.code.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.cause.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [category, search]);

  const activeError: ErrorEntry = useMemo(() => {
    return ERROR_DATABASE.find(e => e.id === selectedId) || ERROR_DATABASE[0];
  }, [selectedId]);

  return (
    <div className="space-y-4">
      {/* Category Tabs & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: 'all', label: 'All Errors' },
            { id: 'http', label: 'HTTP Status' },
            { id: 'linux', label: 'Linux / POSIX' },
            { id: 'java', label: 'Java Exceptions' },
            { id: 'docker-git', label: 'Docker & Git' },
          ].map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                category === c.id
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search e.g. 403, ENOENT, NPE..."
            className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Error List */}
        <div className="lg:col-span-5 space-y-2 max-h-[540px] overflow-y-auto pr-1">
          {filteredErrors.map(e => (
            <div
              key={e.id}
              onClick={() => setSelectedId(e.id)}
              className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                selectedId === e.id
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono font-bold text-gray-800 dark:text-dark-text">{e.code}</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-border text-gray-600 dark:text-dark-muted">
                  {e.category}
                </span>
              </div>
              <h4 className="font-semibold text-gray-700 dark:text-dark-text text-[11px] mb-1">{e.title}</h4>
              <p className="text-[11px] text-gray-500 dark:text-dark-muted line-clamp-2">{e.summary}</p>
            </div>
          ))}
          {filteredErrors.length === 0 && (
            <p className="text-xs text-gray-400 p-4 text-center">No error definitions matching query.</p>
          )}
        </div>

        {/* Right: Detailed Error Dossier */}
        <div className="lg:col-span-7">
          {activeError && (
            <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                      {activeError.code}
                    </span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-dark-border text-gray-600 dark:text-dark-muted">
                      {activeError.category}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-dark-text mt-1">{activeError.title}</h3>
                </div>

                <CopyButton value={`${activeError.code} - ${activeError.title}: ${activeError.solution}`} label="Copy Guide" />
              </div>

              {/* Summary */}
              <div className="space-y-1 text-xs">
                <span className="font-semibold text-gray-400 uppercase tracking-wider text-[11px] block">
                  What It Means
                </span>
                <p className="text-gray-700 dark:text-dark-text leading-relaxed bg-gray-50 dark:bg-dark-border/30 p-2.5 rounded-lg border border-gray-100 dark:border-dark-border/50">
                  {activeError.summary}
                </p>
              </div>

              {/* Root Cause */}
              <div className="space-y-1 text-xs">
                <span className="font-semibold text-gray-400 uppercase tracking-wider text-[11px] block">
                  Common Root Cause
                </span>
                <p className="text-rose-700 dark:text-rose-300 bg-rose-50/50 dark:bg-rose-950/20 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900/40 leading-relaxed">
                  {activeError.cause}
                </p>
              </div>

              {/* Solution */}
              <div className="space-y-1 text-xs">
                <span className="font-semibold text-gray-400 uppercase tracking-wider text-[11px] block flex items-center space-x-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span>How to Fix</span>
                </span>
                <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 text-gray-800 dark:text-dark-text font-mono text-[11px] leading-relaxed">
                  {activeError.solution}
                </div>
              </div>

              {activeError.reference && (
                <div className="text-[11px] text-gray-400 pt-2 border-t border-gray-100 dark:border-dark-border flex items-center space-x-1">
                  <BookOpen className="w-3 h-3" />
                  <span>Reference: {activeError.reference}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorCodeSearchTool;

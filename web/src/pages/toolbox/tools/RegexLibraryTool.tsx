import React, { useMemo, useState } from 'react';
import { CheckCircle2, Search, Sparkles, XCircle } from 'lucide-react';
import { CopyButton, ToolError } from '../components/ToolUI';
import { REGEX_PATTERNS, RegexItem } from '../lib/regexLibrary';

export const RegexLibraryTool: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('email');
  const [search, setSearch] = useState<string>('');
  const [category, setCategory] = useState<string>('all');
  const [customFlags, setCustomFlags] = useState<string>('g');
  const [testText, setTestText] = useState<string>('sanjeev.dev+ops@sub.domain.co.in');

  const filteredPatterns = useMemo(() => {
    return REGEX_PATTERNS.filter(p => {
      const matchesCat = category === 'all' || p.category === category;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.pattern.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [category, search]);

  const activePattern: RegexItem = useMemo(() => {
    return REGEX_PATTERNS.find(p => p.id === selectedId) || REGEX_PATTERNS[0];
  }, [selectedId]);

  const testResult = useMemo(() => {
    try {
      const reg = new RegExp(activePattern.pattern, customFlags);
      const isMatch = reg.test(testText);
      // Reset lastIndex for exec loops
      reg.lastIndex = 0;

      const matches: { text: string; index: number; groups: string[] }[] = [];
      let match: RegExpExecArray | null;

      if (customFlags.includes('g')) {
        let guard = 0;
        while ((match = reg.exec(testText)) !== null && guard++ < 200) {
          matches.push({
            text: match[0],
            index: match.index,
            groups: match.slice(1),
          });
          if (match.index === reg.lastIndex) reg.lastIndex++;
        }
      } else {
        match = reg.exec(testText);
        if (match) {
          matches.push({
            text: match[0],
            index: match.index,
            groups: match.slice(1),
          });
        }
      }

      return { isMatch, matches, error: null };
    } catch (err: any) {
      return { isMatch: false, matches: [], error: err.message };
    }
  }, [activePattern, customFlags, testText]);

  return (
    <div className="space-y-4">
      {/* Category and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: 'all', label: 'All Patterns' },
            { id: 'web', label: 'Web & Network' },
            { id: 'validation', label: 'Forms & Slugs' },
            { id: 'numbers', label: 'Numbers & Dates' },
            { id: 'code', label: 'Code & Data' },
            { id: 'security', label: 'Security & Auth' },
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
            placeholder="Search regex patterns..."
            className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Pattern Catalog */}
        <div className="lg:col-span-5 space-y-2 max-h-[560px] overflow-y-auto pr-1">
          {filteredPatterns.map(p => (
            <div
              key={p.id}
              onClick={() => {
                setSelectedId(p.id);
                setTestText(p.sampleMatch);
              }}
              className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                selectedId === p.id
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm'
                  : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg hover:border-gray-300 dark:hover:border-dark-border/80'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-gray-800 dark:text-dark-text">{p.name}</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-border text-gray-600 dark:text-dark-muted">
                  {p.category}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-dark-muted line-clamp-2 mb-2">
                {p.description}
              </p>
              <div className="font-mono text-[10px] p-1.5 rounded bg-gray-50 dark:bg-dark-border/50 text-emerald-700 dark:text-emerald-400 truncate">
                /{p.pattern}/
              </div>
            </div>
          ))}
          {filteredPatterns.length === 0 && (
            <p className="text-xs text-gray-400 p-4 text-center">No matching regular expressions found.</p>
          )}
        </div>

        {/* Right: Interactive Inspector & Live Tester */}
        <div className="lg:col-span-7 space-y-4">
          {/* Selected Pattern Header */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-dark-text">{activePattern.name}</h3>
                <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">{activePattern.description}</p>
              </div>
              <CopyButton value={activePattern.pattern} label="Copy Pattern" />
            </div>

            <div className="p-3 rounded-lg bg-gray-900 text-emerald-400 font-mono text-xs break-all border border-gray-800 flex items-center justify-between gap-2">
              <span>/{activePattern.pattern}/{customFlags}</span>
            </div>

            {/* Token Explanations */}
            {activePattern.tokens && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Pattern Breakdown</span>
                <div className="grid grid-cols-1 gap-1">
                  {activePattern.tokens.map((t, idx) => (
                    <div key={idx} className="flex items-start space-x-2 text-xs">
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                        {t.token}
                      </span>
                      <span className="text-gray-600 dark:text-dark-muted text-[11px]">{t.explanation}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Interactive Tester */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 dark:text-dark-text flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Live Tester</span>
              </span>

              <div className="flex items-center space-x-2 text-xs">
                <span className="text-gray-400">Flags:</span>
                {['g', 'i', 'm'].map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setCustomFlags(flags =>
                        flags.includes(f) ? flags.replace(f, '') : flags + f
                      );
                    }}
                    className={`px-2 py-0.5 font-mono rounded font-bold cursor-pointer transition-colors ${
                      customFlags.includes(f)
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-100 dark:bg-dark-border text-gray-600 dark:text-dark-muted'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={testText}
              onChange={e => setTestText(e.target.value)}
              rows={4}
              placeholder="Enter sample test strings..."
              className="w-full font-mono text-xs p-3 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />

            {/* Match Status Banner */}
            {testResult.error ? (
              <ToolError error={testResult.error} />
            ) : (
              <div className="flex items-center justify-between p-2.5 rounded-lg border text-xs bg-gray-50 dark:bg-dark-border/40 border-gray-200 dark:border-dark-border">
                <div className="flex items-center space-x-2">
                  {testResult.isMatch ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">Match Found</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span className="font-semibold text-rose-600 dark:text-rose-400">No Match</span>
                    </>
                  )}
                </div>
                <span className="text-gray-500 dark:text-dark-muted font-mono">
                  {testResult.matches.length} match(es) detected
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegexLibraryTool;

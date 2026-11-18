import React, { useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';
import { SQL_DIALECTS, SqlDialect, SqlKeywordCase, formatSql } from '../lib/sql';

type BeautifyPreset = 'aligned' | 'readable' | 'analytics' | 'compact';

const SAMPLE_COMPLEX_SQL = `-- Monthly active developer metrics with CTE & CASE breakdown
with recent_commits as (select author_id, repo_id, count(*) as commit_cnt from commits where created_at >= current_date - interval '30 days' group by author_id, repo_id) select u.username, r.name as repository, rc.commit_cnt, case when rc.commit_cnt >= 50 then 'Core Maintainer' when rc.commit_cnt >= 10 then 'Active Contributor' else 'Occasional' end as contributor_tier from recent_commits rc inner join users u on u.id = rc.author_id left join repositories r on r.id = rc.repo_id where u.is_active = true and r.is_private = false order by rc.commit_cnt desc, u.username asc limit 100;`;

export const SqlBeautifierTool: React.FC = () => {
  const [input, setInput] = useState(SAMPLE_COMPLEX_SQL);
  const [dialect, setDialect] = useState<SqlDialect>('postgresql');
  const [preset, setPreset] = useState<BeautifyPreset>('aligned');
  const [keywordCase, setKeywordCase] = useState<SqlKeywordCase>('upper');
  const [keepComments, setKeepComments] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isFullscreen]);

  const output = useMemo(() => {
    if (!input.trim()) return '';
    if (preset === 'aligned') {
      return formatSql(input, {
        dialect,
        indent: '2',
        keywordCase,
        commaPosition: 'trailing',
        alignClauses: true,
        stripComments: !keepComments,
        linesBetweenQueries: 2,
      });
    }
    if (preset === 'analytics') {
      return formatSql(input, {
        dialect,
        indent: '4',
        keywordCase,
        commaPosition: 'leading',
        alignClauses: false,
        stripComments: !keepComments,
        linesBetweenQueries: 2,
      });
    }
    if (preset === 'compact') {
      return formatSql(input, {
        dialect,
        indent: '2',
        keywordCase,
        commaPosition: 'trailing',
        alignClauses: false,
        stripComments: !keepComments,
        linesBetweenQueries: 1,
      });
    }
    // readable (4 spaces standard)
    return formatSql(input, {
      dialect,
      indent: '4',
      keywordCase,
      commaPosition: 'trailing',
      alignClauses: false,
      stripComments: !keepComments,
      linesBetweenQueries: 2,
    });
  }, [input, dialect, preset, keywordCase, keepComments]);

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-white dark:bg-dark-bg p-6 overflow-y-auto space-y-4'
    : 'space-y-4';

  return (
    <div className={containerClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-0.5">
            {[
              { id: 'aligned', label: 'Aligned Clauses' },
              { id: 'readable', label: 'Readable (4sp)' },
              { id: 'analytics', label: 'Analytics (Leading ,)' },
              { id: 'compact', label: 'Compact (2sp)' },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id as BeautifyPreset)}
                className={`px-2.5 py-1.5 rounded-md font-bold cursor-pointer transition-colors ${
                  preset === p.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="w-40">
            <ThemedSelect
              value={dialect}
              onChange={v => setDialect(v as SqlDialect)}
              options={SQL_DIALECTS.map(d => ({ value: d.id, label: d.label }))}
              ariaLabel="SQL Dialect"
            />
          </div>

          <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-0.5">
            {[
              { id: 'upper', label: 'UPPER' },
              { id: 'lower', label: 'lower' },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setKeywordCase(opt.id as SqlKeywordCase)}
                className={`px-2 py-1.5 rounded-md font-bold cursor-pointer transition-colors ${
                  keywordCase === opt.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label className="flex items-center space-x-1.5 cursor-pointer text-gray-700 dark:text-dark-text font-medium">
            <input
              type="checkbox"
              checked={keepComments}
              onChange={e => setKeepComments(e.target.checked)}
              className="accent-emerald-600"
            />
            <span>Preserve comments</span>
          </label>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setInput(SAMPLE_COMPLEX_SQL)}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span>Sample</span>
          </button>
          <button
            type="button"
            onClick={() => setInput('')}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Expand Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? 'Exit Fullscreen' : 'Expand'}</span>
          </button>
          <CopyButton value={output} />
        </div>
      </div>

      <div className="flex items-center space-x-2 text-xs text-teal-700 dark:text-teal-400 bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-900/50 rounded-lg px-3 py-2">
        <Wand2 className="w-3.5 h-3.5 flex-shrink-0" />
        <span>
          <strong>Beautifier Preset:</strong>{' '}
          {preset === 'aligned'
            ? 'Right-aligns major SQL keywords (SELECT, FROM, JOIN, WHERE, ORDER BY) into a clean vertical river for rapid code review.'
            : preset === 'analytics'
            ? 'BI / Analytics layout with 4-space indentation and leading commas for clean Git diffs.'
            : preset === 'readable'
            ? 'Classic 4-space indentation with expanded clauses, subqueries, and CASE/WHEN blocks.'
            : 'Compact 2-space layout maximizing visible query lines.'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
            Original SQL
          </label>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={isFullscreen ? 26 : 16}
            spellCheck={false}
            placeholder="Paste messy or single-line SQL here..."
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
            Beautified SQL
          </label>
          <textarea
            readOnly
            value={output}
            rows={isFullscreen ? 26 : 16}
            spellCheck={false}
            placeholder="Beautified SQL output..."
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg/70 font-mono text-xs text-gray-900 dark:text-emerald-300 focus:outline-none resize-y"
          />
        </div>
      </div>
    </div>
  );
};

export default SqlBeautifierTool;

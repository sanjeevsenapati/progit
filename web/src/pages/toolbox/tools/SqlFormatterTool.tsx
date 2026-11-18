import React, { useMemo, useState } from 'react';
import { CheckCircle2, Sparkles, Trash2 } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';
import { SQL_DIALECTS, SqlDialect, SqlKeywordCase, formatSql } from '../lib/sql';

const SAMPLE_SQL = `select u.id, u.username, u.email, count(r.id) as repo_count, max(r.updated_at) as last_push from users u left join repositories r on r.owner_id = u.id and r.is_archived = false where u.is_active = true and u.created_at >= '2026-01-01' group by u.id, u.username, u.email having count(r.id) > 0 order by repo_count desc, u.username asc limit 50;`;

export const SqlFormatterTool: React.FC = () => {
  const [input, setInput] = useState(SAMPLE_SQL);
  const [dialect, setDialect] = useState<SqlDialect>('postgresql');
  const [indent, setIndent] = useState<'2' | '4' | 'tab'>('2');
  const [keywordCase, setKeywordCase] = useState<SqlKeywordCase>('upper');
  const [commaPosition, setCommaPosition] = useState<'trailing' | 'leading'>('trailing');
  const [stripComments, setStripComments] = useState(false);

  const { output, stats } = useMemo(() => {
    if (!input.trim()) return { output: '', stats: null };
    const formatted = formatSql(input, {
      dialect,
      indent,
      keywordCase,
      commaPosition,
      stripComments,
      alignClauses: false,
    });
    return {
      output: formatted,
      stats: {
        lines: formatted ? formatted.split('\n').length : 0,
        bytes: new Blob([formatted]).size,
      },
    };
  }, [input, dialect, indent, keywordCase, commaPosition, stripComments]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="w-44">
            <ThemedSelect
              value={dialect}
              onChange={v => setDialect(v as SqlDialect)}
              options={SQL_DIALECTS.map(d => ({ value: d.id, label: d.label }))}
              ariaLabel="SQL Dialect"
            />
          </div>

          <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-0.5">
            {[
              { id: '2', label: '2 Spaces' },
              { id: '4', label: '4 Spaces' },
              { id: 'tab', label: 'Tab' },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setIndent(opt.id as '2' | '4' | 'tab')}
                className={`px-2.5 py-1.5 rounded-md font-bold cursor-pointer transition-colors ${
                  indent === opt.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-0.5">
            {[
              { id: 'upper', label: 'UPPER' },
              { id: 'lower', label: 'lower' },
              { id: 'preserve', label: 'Keep' },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setKeywordCase(opt.id as SqlKeywordCase)}
                className={`px-2.5 py-1.5 rounded-md font-bold cursor-pointer transition-colors ${
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
              checked={commaPosition === 'leading'}
              onChange={e => setCommaPosition(e.target.checked ? 'leading' : 'trailing')}
              className="accent-emerald-600"
            />
            <span>Leading commas</span>
          </label>

          <label className="flex items-center space-x-1.5 cursor-pointer text-gray-700 dark:text-dark-text font-medium">
            <input
              type="checkbox"
              checked={stripComments}
              onChange={e => setStripComments(e.target.checked)}
              className="accent-emerald-600"
            />
            <span>Strip comments</span>
          </label>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setInput(SAMPLE_SQL)}
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
          <CopyButton value={output} />
        </div>
      </div>

      {stats && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
          <span className="inline-flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Formatted ({SQL_DIALECTS.find(d => d.id === dialect)?.label})</span>
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-600 dark:text-dark-muted">{stats.lines} lines</span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-600 dark:text-dark-muted">{stats.bytes} bytes</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
            Input SQL
          </label>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={16}
            spellCheck={false}
            placeholder="Paste unformatted SQL query here..."
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
            Formatted Output
          </label>
          <textarea
            readOnly
            value={output}
            rows={16}
            spellCheck={false}
            placeholder="Formatted SQL appears here..."
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg/70 font-mono text-xs text-gray-900 dark:text-emerald-300 focus:outline-none resize-y"
          />
        </div>
      </div>
    </div>
  );
};

export default SqlFormatterTool;

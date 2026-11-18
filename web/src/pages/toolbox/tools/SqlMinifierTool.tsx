import React, { useMemo, useState } from 'react';
import { ArrowDownRight, Sparkles, Trash2 } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';
import { SQL_DIALECTS, SqlDialect, minifySql } from '../lib/sql';

const SAMPLE_MULTI_LINE_SQL = `-- Fetch active enterprise repositories with owner details
SELECT
  r.id,
  r.name,
  r.description,
  /* Owner contact info */
  u.username AS owner_name,
  u.email
FROM repositories r
INNER JOIN users u
  ON u.id = r.owner_id
WHERE
  r.is_private = false
  AND r.description <> 'archived -- keep literal intact'
ORDER BY
  r.updated_at DESC
LIMIT 25;`;

export const SqlMinifierTool: React.FC = () => {
  const [input, setInput] = useState(SAMPLE_MULTI_LINE_SQL);
  const [dialect, setDialect] = useState<SqlDialect>('postgresql');
  const [stripComments, setStripComments] = useState(true);
  const [wrapJsonString, setWrapJsonString] = useState(false);

  const { output, stats } = useMemo(() => {
    if (!input.trim()) return { output: '', stats: null };
    const minified = minifySql(input, { dialect, stripComments });
    const finalOut = wrapJsonString ? JSON.stringify(minified) : minified;
    const origBytes = new Blob([input]).size;
    const minBytes = new Blob([minified]).size;
    const savedPct = origBytes > 0 ? Math.max(0, Math.round(((origBytes - minBytes) / origBytes) * 100)) : 0;
    return {
      output: finalOut,
      stats: { origBytes, minBytes, savedPct },
    };
  }, [input, dialect, stripComments, wrapJsonString]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="w-44">
            <ThemedSelect
              value={dialect}
              onChange={v => setDialect(v as SqlDialect)}
              options={SQL_DIALECTS.map(d => ({ value: d.id, label: d.label }))}
              ariaLabel="SQL Dialect"
            />
          </div>

          <label className="flex items-center space-x-1.5 cursor-pointer text-gray-700 dark:text-dark-text font-medium">
            <input
              type="checkbox"
              checked={stripComments}
              onChange={e => setStripComments(e.target.checked)}
              className="accent-emerald-600"
            />
            <span>Strip SQL comments (`--`, `/* */`)</span>
          </label>

          <label className="flex items-center space-x-1.5 cursor-pointer text-gray-700 dark:text-dark-text font-medium">
            <input
              type="checkbox"
              checked={wrapJsonString}
              onChange={e => setWrapJsonString(e.target.checked)}
              className="accent-emerald-600"
            />
            <span>Escape as JSON string</span>
          </label>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setInput(SAMPLE_MULTI_LINE_SQL)}
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
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
            <div className="text-[11px] font-bold uppercase text-gray-400">Original Size</div>
            <div className="text-base font-extrabold text-gray-900 dark:text-white font-mono">{stats.origBytes} B</div>
          </div>
          <div className="p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
            <div className="text-[11px] font-bold uppercase text-gray-400">Minified Size</div>
            <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">{stats.minBytes} B</div>
          </div>
          <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20">
            <div className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-400 flex items-center space-x-1">
              <ArrowDownRight className="w-3.5 h-3.5" />
              <span>Size Saved</span>
            </div>
            <div className="text-base font-extrabold text-emerald-700 dark:text-emerald-300 font-mono">{stats.savedPct}%</div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
            Formatted SQL Input
          </label>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={12}
            spellCheck={false}
            placeholder="Paste SQL query to minify..."
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
            Minified Single-Line SQL
          </label>
          <textarea
            readOnly
            value={output}
            rows={5}
            spellCheck={false}
            placeholder="Minified query output..."
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg/70 font-mono text-xs text-gray-900 dark:text-emerald-300 focus:outline-none resize-y"
          />
        </div>
      </div>
    </div>
  );
};

export default SqlMinifierTool;

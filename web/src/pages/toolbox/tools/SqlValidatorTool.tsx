import React, { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Sparkles, Trash2 } from 'lucide-react';
import { ThemedSelect } from '../components/ToolUI';
import { SQL_DIALECTS, SqlDialect, validateSql } from '../lib/sql';

const SAMPLE_VALID_SQL = `SELECT
  u.id,
  u.username,
  COUNT(r.id) AS total_repos
FROM users u
LEFT JOIN repositories r ON r.owner_id = u.id
WHERE u.is_active = true
GROUP BY u.id, u.username
ORDER BY total_repos DESC
LIMIT 20;`;

const SAMPLE_BROKEN_SQL = `SELECT u.id, u.username,
FROM users u
JOIN repositories r
WHERE u.is_active = true
GROUP u.id;

DELETE FROM audit_logs;`;

export const SqlValidatorTool: React.FC = () => {
  const [input, setInput] = useState(SAMPLE_VALID_SQL);
  const [dialect, setDialect] = useState<SqlDialect>('postgresql');

  const result = useMemo(() => validateSql(input, dialect), [input, dialect]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-xs">
          <div className="w-48">
            <ThemedSelect
              value={dialect}
              onChange={v => setDialect(v as SqlDialect)}
              options={SQL_DIALECTS.map(d => ({ value: d.id, label: d.label }))}
              ariaLabel="SQL Dialect"
            />
          </div>
          {input.trim() && (
            <span
              className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full font-bold ${
                result.valid
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
              }`}
            >
              {result.valid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              <span>
                {result.valid
                  ? `Valid SQL (${result.statements.length} statement${result.statements.length === 1 ? '' : 's'})`
                  : `${result.errors.length} Syntax Error${result.errors.length === 1 ? '' : 's'}`}
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setInput(SAMPLE_VALID_SQL)}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span>Valid Sample</span>
          </button>
          <button
            type="button"
            onClick={() => setInput(SAMPLE_BROKEN_SQL)}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/40 cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Error Sample</span>
          </button>
          <button
            type="button"
            onClick={() => setInput('')}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
          SQL Query / Script to Validate
        </label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={11}
          spellCheck={false}
          placeholder="Paste one or more SQL statements separated by semicolons..."
          className="w-full p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
        />
      </div>

      {/* Diagnostics */}
      {input.trim() && (
        <div className="space-y-3">
          {result.errors.length === 0 && result.warnings.length === 0 && result.infos.length === 0 && (
            <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center space-x-2.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>No syntax errors, unclosed tokens, or safety warnings detected ({result.tokenCount} tokens analyzed).</span>
            </div>
          )}

          {result.errors.map((d, i) => (
            <div
              key={`err-${i}`}
              className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 flex items-start space-x-2.5 text-xs text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <div className="space-y-0.5">
                <div className="font-bold">
                  Error <span className="font-mono text-[11px] opacity-80">[{d.code}]</span> &mdash; Line {d.line}, Col {d.column}
                </div>
                <div>{d.message}</div>
              </div>
            </div>
          ))}

          {result.warnings.map((d, i) => (
            <div
              key={`warn-${i}`}
              className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 flex items-start space-x-2.5 text-xs text-amber-800 dark:text-amber-300"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="space-y-0.5">
                <div className="font-bold">
                  Warning <span className="font-mono text-[11px] opacity-80">[{d.code}]</span> &mdash; Line {d.line}, Col {d.column}
                </div>
                <div>{d.message}</div>
              </div>
            </div>
          ))}

          {result.infos.map((d, i) => (
            <div
              key={`info-${i}`}
              className="p-3 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/80 dark:bg-sky-950/30 flex items-start space-x-2.5 text-xs text-sky-800 dark:text-sky-300"
            >
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
              <div className="space-y-0.5">
                <div className="font-bold">
                  Advisory <span className="font-mono text-[11px] opacity-80">[{d.code}]</span> &mdash; Line {d.line}, Col {d.column}
                </div>
                <div>{d.message}</div>
              </div>
            </div>
          ))}

          {/* Statement Breakdown Table */}
          {result.statements.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-dark-hover border-b border-gray-200 dark:border-dark-border text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-dark-text">
                Parsed Statements ({result.statements.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50/70 dark:bg-dark-bg/50 text-gray-500 dark:text-dark-muted border-b border-gray-200 dark:border-dark-border">
                    <tr>
                      <th className="px-3 py-2 font-bold">#</th>
                      <th className="px-3 py-2 font-bold">Type</th>
                      <th className="px-3 py-2 font-bold">Lines</th>
                      <th className="px-3 py-2 font-bold">Tables</th>
                      <th className="px-3 py-2 font-bold">Preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                    {result.statements.map(st => (
                      <tr key={st.index} className="bg-white dark:bg-dark-surface">
                        <td className="px-3 py-2 font-mono text-gray-400">{st.index}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[11px] bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300">
                            {st.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-gray-600 dark:text-dark-muted">
                          L{st.startLine}–L{st.endLine}
                        </td>
                        <td className="px-3 py-2 font-mono text-gray-800 dark:text-dark-text">
                          {st.tables.length > 0 ? st.tables.join(', ') : '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-gray-500 dark:text-dark-muted truncate max-w-xs">
                          {st.preview}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SqlValidatorTool;

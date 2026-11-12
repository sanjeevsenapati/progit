import React, { useState, useMemo } from 'react';
import { CheckCircle2, Trash2, Sparkles } from 'lucide-react';
import { CopyButton, ToolError } from '../components/ToolUI';

const SAMPLE_JSON = `{
  "service": "progit",
  "version": "1.6.0",
  "features": {
    "toolbox": true,
    "dns": true
  },
  "limits": {
    "ratePerMinute": 30,
    "timeoutSeconds": 3
  }
}`;

function sortObjectKeys(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(sortObjectKeys);
  if (val !== null && typeof val === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(val as Record<string, unknown>).sort()) {
      sorted[k] = sortObjectKeys((val as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return val;
}

export const JsonTool: React.FC = () => {
  const [input, setInput] = useState(SAMPLE_JSON);
  const [indent, setIndent] = useState<'2' | '4' | 'tab' | 'minify'>('2');
  const [sortKeys, setSortKeys] = useState(false);

  const { output, error, stats } = useMemo(() => {
    const trimmed = input.trim();
    if (!trimmed) return { output: '', error: null, stats: null };
    try {
      let parsed = JSON.parse(trimmed);
      if (sortKeys) {
        parsed = sortObjectKeys(parsed);
      }
      const space = indent === 'minify' ? 0 : indent === 'tab' ? '\t' : parseInt(indent, 10);
      const formatted = JSON.stringify(parsed, null, space);
      return {
        output: formatted,
        error: null,
        stats: {
          inputBytes: new Blob([input]).size,
          outputBytes: new Blob([formatted]).size,
          lines: formatted.split('\n').length,
        },
      };
    } catch (err: unknown) {
      return {
        output: '',
        error: err instanceof Error ? err.message : 'Invalid JSON',
        stats: null,
      };
    }
  }, [input, indent, sortKeys]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-0.5">
            {[
              { id: '2', label: '2 Spaces' },
              { id: '4', label: '4 Spaces' },
              { id: 'tab', label: 'Tab' },
              { id: 'minify', label: 'Minify' },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setIndent(opt.id as typeof indent)}
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

          <label className="flex items-center space-x-1.5 cursor-pointer text-gray-700 dark:text-dark-text font-medium">
            <input type="checkbox" checked={sortKeys} onChange={e => setSortKeys(e.target.checked)} className="accent-emerald-600" />
            <span>Sort keys A-Z</span>
          </label>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setInput(SAMPLE_JSON)}
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

      <ToolError error={error} />

      {!error && stats && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
          <span className="inline-flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Valid JSON</span>
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-600 dark:text-dark-muted font-mono">
            {stats.lines} lines • {stats.outputBytes.toLocaleString()} bytes
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={15}
          spellCheck={false}
          placeholder="Paste JSON here..."
          className="w-full p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
        />
        <textarea
          readOnly
          value={output}
          rows={15}
          spellCheck={false}
          className="w-full p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg font-mono text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none select-all"
        />
      </div>
    </div>
  );
};

export default JsonTool;

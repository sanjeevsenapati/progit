import React, { useState, useMemo } from 'react';
import { ArrowLeftRight, Sparkles, Trash2 } from 'lucide-react';
import { computeLineDiff } from '../lib/diff';

const SAMPLE_LEFT = `server:
  port: 3000
  mode: development
features:
  toolbox: false
  maxRetries: 3`;

const SAMPLE_RIGHT = `server:
  port: 3443
  mode: production
features:
  toolbox: true
  dnsEnabled: true
  maxRetries: 3`;

export const DiffTool: React.FC = () => {
  const [leftText, setLeftText] = useState(SAMPLE_LEFT);
  const [rightText, setRightText] = useState(SAMPLE_RIGHT);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('split');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);

  const diff = useMemo(
    () => computeLineDiff(leftText, rightText, { ignoreWhitespace }),
    [leftText, rightText, ignoreWhitespace]
  );

  const handleSwap = () => {
    setLeftText(rightText);
    setRightText(leftText);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-0.5">
            {([
              { id: 'split', label: 'Side-by-Side' },
              { id: 'unified', label: 'Unified' },
            ] as const).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setViewMode(opt.id)}
                className={`px-2.5 py-1.5 rounded-md font-bold cursor-pointer ${
                  viewMode === opt.id
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
              checked={ignoreWhitespace}
              onChange={e => setIgnoreWhitespace(e.target.checked)}
              className="accent-emerald-600"
            />
            <span>Ignore whitespace</span>
          </label>

          <div className="flex items-center space-x-2 font-mono font-bold">
            <span className="text-emerald-600 dark:text-emerald-400">+{diff.added}</span>
            <span className="text-red-600 dark:text-red-400">-{diff.removed}</span>
            <span className="text-gray-400">{diff.unchanged} equal</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleSwap}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Swap</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLeftText(SAMPLE_LEFT);
              setRightText(SAMPLE_RIGHT);
            }}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span>Sample</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLeftText('');
              setRightText('');
            }}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Original</label>
          <textarea
            value={leftText}
            onChange={e => setLeftText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder="Paste original text..."
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-xs text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Modified</label>
          <textarea
            value={rightText}
            onChange={e => setRightText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder="Paste modified text..."
            className="w-full p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-xs text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {diff.truncated && (
        <div className="text-xs text-amber-600 dark:text-amber-400">
          Payload exceeded inline matrix limit; displaying block diff for responsive performance.
        </div>
      )}

      {/* Diff Output */}
      <div className="rounded-xl border border-gray-200 dark:border-dark-border overflow-x-auto bg-white dark:bg-dark-bg font-mono text-xs">
        {viewMode === 'unified' ? (
          <div className="divide-y divide-gray-100/60 dark:divide-dark-border/40">
            {diff.lines.map((line, i) => (
              <div
                key={i}
                className={`flex items-start px-3 py-1 whitespace-pre ${
                  line.type === 'add'
                    ? 'bg-emerald-50 dark:bg-emerald-950/35 text-emerald-900 dark:text-emerald-200'
                    : line.type === 'remove'
                      ? 'bg-red-50 dark:bg-red-950/35 text-red-900 dark:text-red-200'
                      : 'text-gray-700 dark:text-dark-text'
                }`}
              >
                <span className="w-9 text-right pr-2 text-gray-400 select-none flex-shrink-0">{line.oldLine ?? ''}</span>
                <span className="w-9 text-right pr-3 text-gray-400 select-none flex-shrink-0">{line.newLine ?? ''}</span>
                <span className="w-4 select-none font-bold flex-shrink-0">
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </span>
                <span className="flex-1">{line.text || ' '}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-gray-100/60 dark:divide-dark-border/40 min-w-[640px]">
            {diff.lines.map((line, i) => (
              <div key={i} className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-dark-border">
                <div
                  className={`flex items-start px-3 py-1 whitespace-pre ${
                    line.type === 'remove'
                      ? 'bg-red-50 dark:bg-red-950/35 text-red-900 dark:text-red-200'
                      : line.type === 'add'
                        ? 'bg-gray-50/70 dark:bg-dark-surface/40 text-gray-300'
                        : 'text-gray-700 dark:text-dark-text'
                  }`}
                >
                  <span className="w-8 text-right pr-2 text-gray-400 select-none flex-shrink-0">{line.oldLine ?? ''}</span>
                  <span className="flex-1 overflow-x-hidden">{line.type === 'add' ? '' : line.text || ' '}</span>
                </div>
                <div
                  className={`flex items-start px-3 py-1 whitespace-pre ${
                    line.type === 'add'
                      ? 'bg-emerald-50 dark:bg-emerald-950/35 text-emerald-900 dark:text-emerald-200'
                      : line.type === 'remove'
                        ? 'bg-gray-50/70 dark:bg-dark-surface/40 text-gray-300'
                        : 'text-gray-700 dark:text-dark-text'
                  }`}
                >
                  <span className="w-8 text-right pr-2 text-gray-400 select-none flex-shrink-0">{line.newLine ?? ''}</span>
                  <span className="flex-1 overflow-x-hidden">{line.type === 'remove' ? '' : line.text || ' '}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DiffTool;

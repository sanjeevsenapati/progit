import React, { useState, useEffect } from 'react';
import { CheckCircle2, Trash2, Sparkles, ArrowLeftRight } from 'lucide-react';
import { CopyButton, ToolError } from '../components/ToolUI';

const SAMPLE_YAML = `service: progit
version: 1.6.0
features:
  toolbox: true
  dns: true
routes:
  - /toolbox
  - /api/v1/toolbox/dns
`;

export const YamlTool: React.FC = () => {
  const [mode, setMode] = useState<'yaml-format' | 'yaml-to-json' | 'json-to-yaml'>('yaml-format');
  const [input, setInput] = useState(SAMPLE_YAML);
  const [indent, setIndent] = useState(2);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [yamlLib, setYamlLib] = useState<typeof import('js-yaml') | null>(null);

  useEffect(() => {
    let active = true;
    import('js-yaml')
      .then(mod => {
        if (active) setYamlLib(mod);
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load YAML parser');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!yamlLib) return;
    const trimmed = input.trim();
    if (!trimmed) {
      setOutput('');
      setError(null);
      return;
    }

    try {
      if (mode === 'yaml-format') {
        const parsed = yamlLib.load(trimmed);
        setOutput(yamlLib.dump(parsed, { indent, lineWidth: 120 }));
      } else if (mode === 'yaml-to-json') {
        const parsed = yamlLib.load(trimmed);
        setOutput(JSON.stringify(parsed, null, indent));
      } else {
        const parsed = JSON.parse(trimmed);
        setOutput(yamlLib.dump(parsed, { indent, lineWidth: 120 }));
      }
      setError(null);
    } catch (err: unknown) {
      setOutput('');
      setError(err instanceof Error ? err.message : 'Parse error');
    }
  }, [input, mode, indent, yamlLib]);

  const handleSwap = () => {
    if (error || !output) return;
    setInput(output);
    if (mode === 'yaml-to-json') setMode('json-to-yaml');
    else if (mode === 'json-to-yaml') setMode('yaml-to-json');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-0.5">
            {[
              { id: 'yaml-format', label: 'Format YAML' },
              { id: 'yaml-to-json', label: 'YAML → JSON' },
              { id: 'json-to-yaml', label: 'JSON → YAML' },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMode(opt.id as typeof mode)}
                className={`px-2.5 py-1.5 rounded-md font-bold cursor-pointer transition-colors ${
                  mode === opt.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            value={indent}
            onChange={e => setIndent(parseInt(e.target.value, 10))}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text font-semibold"
          >
            <option value={2}>2 spaces</option>
            <option value={4}>4 spaces</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          {mode !== 'yaml-format' && (
            <button
              type="button"
              onClick={handleSwap}
              disabled={!output || !!error}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40 cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Swap</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMode('yaml-format');
              setInput(SAMPLE_YAML);
            }}
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

      {!error && output && (
        <div className="flex items-center space-x-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{mode === 'json-to-yaml' ? 'Valid JSON converted to YAML' : 'Valid YAML'}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={15}
          spellCheck={false}
          placeholder={mode === 'json-to-yaml' ? 'Paste JSON...' : 'Paste YAML...'}
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

export default YamlTool;

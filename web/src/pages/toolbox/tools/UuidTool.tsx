import React, { useState, useCallback, useEffect } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { CopyButton } from '../components/ToolUI';

function generateUUIDv4(): string {
  if (typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// RFC 9562 UUID v7 (Unix ms timestamp + 74 random bits)
function generateUUIDv7(): string {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  const ts = BigInt(Date.now());
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const UuidTool: React.FC = () => {
  const [version, setVersion] = useState<'v4' | 'v7'>('v4');
  const [count, setCount] = useState(5);
  const [uppercase, setUppercase] = useState(false);
  const [noHyphens, setNoHyphens] = useState(false);
  const [rawList, setRawList] = useState<string[]>([]);

  const generate = useCallback(() => {
    const n = Math.max(1, Math.min(500, count));
    const next: string[] = [];
    for (let i = 0; i < n; i++) {
      next.push(version === 'v7' ? generateUUIDv7() : generateUUIDv4());
    }
    setRawList(next);
  }, [version, count]);

  useEffect(() => {
    generate();
  }, [generate]);

  const formatted = rawList.map(id => {
    let out = noHyphens ? id.replace(/-/g, '') : id;
    if (uppercase) out = out.toUpperCase();
    return out;
  });

  const output = formatted.join('\n');

  const handleDownload = () => {
    const blob = new Blob([output + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uuids-${version}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface p-0.5">
            {(['v4', 'v7'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setVersion(v)}
                className={`px-3 py-1.5 rounded-md font-bold cursor-pointer transition-colors ${
                  version === v
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {v === 'v4' ? 'UUID v4 (Random)' : 'UUID v7 (Time-ordered)'}
              </button>
            ))}
          </div>

          <label className="flex items-center space-x-2 text-gray-700 dark:text-dark-text font-medium">
            <span>Count:</span>
            <input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={e => setCount(Math.max(1, Math.min(500, parseInt(e.target.value || '1', 10))))}
              className="w-20 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface font-mono text-gray-900 dark:text-white"
            />
          </label>

          <label className="flex items-center space-x-1.5 cursor-pointer select-none text-gray-700 dark:text-dark-text font-medium">
            <input type="checkbox" checked={uppercase} onChange={e => setUppercase(e.target.checked)} className="accent-emerald-600" />
            <span>Uppercase</span>
          </label>

          <label className="flex items-center space-x-1.5 cursor-pointer select-none text-gray-700 dark:text-dark-text font-medium">
            <input type="checkbox" checked={noHyphens} onChange={e => setNoHyphens(e.target.checked)} className="accent-emerald-600" />
            <span>No hyphens</span>
          </label>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={generate}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Generate</span>
          </button>
          <CopyButton value={output} label="Copy All" />
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>.txt</span>
          </button>
        </div>
      </div>

      <textarea
        readOnly
        value={output}
        rows={Math.min(18, Math.max(5, formatted.length))}
        className="w-full p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg font-mono text-sm text-gray-900 dark:text-white focus:outline-none select-all"
      />
    </div>
  );
};

export default UuidTool;


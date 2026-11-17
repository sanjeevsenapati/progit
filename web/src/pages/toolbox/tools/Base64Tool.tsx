import React, { useState, useMemo } from 'react';
import { ArrowLeftRight, Upload, Trash2 } from 'lucide-react';
import { CopyButton, ToolError } from '../components/ToolUI';

function bytesToBase64(bytes: Uint8Array, urlSafe: boolean, stripPadding: boolean): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  let b64 = btoa(binary);
  if (urlSafe) {
    b64 = b64.replace(/\+/g, '-').replace(/\//g, '_');
  }
  if (stripPadding) {
    b64 = b64.replace(/=+$/, '');
  }
  return b64;
}

function base64ToUtf8(input: string): string {
  let clean = input.trim().replace(/\s+/g, '');
  clean = clean.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (clean.length % 4)) % 4;
  clean += '='.repeat(padLen);
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

export const Base64Tool: React.FC = () => {
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [urlSafe, setUrlSafe] = useState(false);
  const [stripPadding, setStripPadding] = useState(false);
  const [input, setInput] = useState('ProGit Toolbox: UTF-8 safe Base64 ✓');
  const [fileDataUrl, setFileDataUrl] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');

  const { output, error } = useMemo(() => {
    if (!input) return { output: '', error: null };
    try {
      if (mode === 'encode') {
        const bytes = new TextEncoder().encode(input);
        return { output: bytesToBase64(bytes, urlSafe, stripPadding), error: null };
      } else {
        return { output: base64ToUtf8(input), error: null };
      }
    } catch (err: unknown) {
      return { output: '', error: err instanceof Error ? err.message : 'Invalid Base64 payload' };
    }
  }, [input, mode, urlSafe, stripPadding]);

  const handleFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setFileName(`${file.name} (exceeds 10 MB browser guard)`);
      setFileDataUrl('');
      return;
    }
    const buf = await file.arrayBuffer();
    const b64 = bytesToBase64(new Uint8Array(buf), false, false);
    const mime = file.type || 'application/octet-stream';
    setFileName(file.name);
    setFileDataUrl(`data:${mime};base64,${b64}`);
  };

  const handleSwap = () => {
    if (error || !output) return;
    setInput(output);
    setMode(prev => (prev === 'encode' ? 'decode' : 'encode'));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-0.5">
            {(['encode', 'decode'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md font-bold capitalize cursor-pointer transition-colors ${
                  mode === m
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === 'encode' && (
            <>
              <label className="flex items-center space-x-1.5 cursor-pointer text-gray-700 dark:text-dark-text font-medium">
                <input type="checkbox" checked={urlSafe} onChange={e => setUrlSafe(e.target.checked)} className="accent-emerald-600" />
                <span>URL-safe (-_)</span>
              </label>
              <label className="flex items-center space-x-1.5 cursor-pointer text-gray-700 dark:text-dark-text font-medium">
                <input type="checkbox" checked={stripPadding} onChange={e => setStripPadding(e.target.checked)} className="accent-emerald-600" />
                <span>No padding (=)</span>
              </label>
            </>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleSwap}
            disabled={!output || !!error}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40 cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Swap</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
            {mode === 'encode' ? 'Plain Text (UTF-8)' : 'Base64 Input'}
          </label>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={10}
            placeholder={mode === 'encode' ? 'Paste text to encode...' : 'Paste Base64 or Base64URL string...'}
            className="w-full p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
            {mode === 'encode' ? 'Base64 Output' : 'Decoded UTF-8 Text'}
          </label>
          <textarea
            readOnly
            value={output}
            rows={10}
            className="w-full p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg font-mono text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none select-all"
          />
        </div>
      </div>

      {/* File -> Base64 Data URL */}
      <div className="p-4 rounded-xl border border-dashed border-gray-300 dark:border-dark-border bg-gray-50/70 dark:bg-dark-bg/50 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-gray-800 dark:text-white">File to Base64 / Data URL</p>
            <p className="text-xs text-gray-500 dark:text-dark-muted">Convert any local file (up to 10 MB) without uploading it anywhere.</p>
          </div>
          <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs font-semibold text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-emerald-500" />
            <span>Choose File</span>
            <input
              type="file"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
        </div>

        {fileName && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-gray-700 dark:text-dark-text">{fileName}</span>
              {fileDataUrl && <CopyButton value={fileDataUrl} label="Copy Data URL" />}
            </div>
            {fileDataUrl && (
              <textarea
                readOnly
                rows={3}
                value={fileDataUrl}
                className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface font-mono text-xs text-gray-700 dark:text-dark-text select-all"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Base64Tool;


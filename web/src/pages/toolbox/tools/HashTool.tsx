import React, { useState, useEffect } from 'react';
import { Upload } from 'lucide-react';
import { CopyButton, ToolError } from '../components/ToolUI';
import { md5Bytes } from '../lib/md5';

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

interface HashResult {
  algo: string;
  hex: string;
}

export const HashTool: React.FC = () => {
  const [text, setText] = useState('hello world');
  const [hmacKey, setHmacKey] = useState('');
  const [uppercase, setUppercase] = useState(false);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [results, setResults] = useState<HashResult[]>([]);
  const [hmacResult, setHmacResult] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const compute = async () => {
      try {
        setError(null);
        const data = fileBytes ?? new TextEncoder().encode(text);
        const sliceBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

        const md5 = md5Bytes(data);
        const [sha1, sha256, sha384, sha512] = await Promise.all([
          window.crypto.subtle.digest('SHA-1', sliceBuffer),
          window.crypto.subtle.digest('SHA-256', sliceBuffer),
          window.crypto.subtle.digest('SHA-384', sliceBuffer),
          window.crypto.subtle.digest('SHA-512', sliceBuffer),
        ]);

        const computed: HashResult[] = [
          { algo: 'MD5', hex: md5 },
          { algo: 'SHA-1', hex: toHex(sha1) },
          { algo: 'SHA-256', hex: toHex(sha256) },
          { algo: 'SHA-384', hex: toHex(sha384) },
          { algo: 'SHA-512', hex: toHex(sha512) },
        ];

        let hmac = '';
        if (hmacKey) {
          const cryptoKey = await window.crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(hmacKey),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
          );
          const sig = await window.crypto.subtle.sign('HMAC', cryptoKey, sliceBuffer);
          hmac = toHex(sig);
        }

        if (!cancelled) {
          setResults(computed);
          setHmacResult(hmac);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Hash calculation failed');
        }
      }
    };

    compute();
    return () => {
      cancelled = true;
    };
  }, [text, hmacKey, fileBytes]);

  const handleFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      setError('File exceeds 50 MB in-browser checksum guard.');
      return;
    }
    const buf = await file.arrayBuffer();
    setFileLabel(`${file.name} (${file.size.toLocaleString()} bytes)`);
    setFileBytes(new Uint8Array(buf));
  };

  const formatHex = (h: string) => (uppercase ? h.toUpperCase() : h);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3 text-xs">
          <label className="flex items-center space-x-1.5 cursor-pointer text-gray-700 dark:text-dark-text font-medium">
            <input type="checkbox" checked={uppercase} onChange={e => setUppercase(e.target.checked)} className="accent-emerald-600" />
            <span>Uppercase hex</span>
          </label>
          {fileLabel && (
            <button
              type="button"
              onClick={() => {
                setFileBytes(null);
                setFileLabel(null);
              }}
              className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold cursor-pointer"
            >
              File: {fileLabel} ×
            </button>
          )}
        </div>

        <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs font-semibold text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer">
          <Upload className="w-3.5 h-3.5 text-emerald-500" />
          <span>Checksum File</span>
          <input
            type="file"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>
      </div>

      <ToolError error={error} />

      {!fileLabel && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
            Input Text
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            placeholder="Enter text to hash..."
            className="w-full p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
          Optional HMAC-SHA256 Secret Key
        </label>
        <input
          type="text"
          value={hmacKey}
          onChange={e => setHmacKey(e.target.value)}
          placeholder="Leave blank to skip HMAC signature..."
          className="w-full px-3.5 py-2 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
        />
      </div>

      <div className="space-y-2.5">
        {results.map(item => {
          const val = formatHex(item.hex);
          return (
            <div
              key={item.algo}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg"
            >
              <div className="min-w-0 space-y-0.5">
                <span className="text-xs font-bold text-gray-500 dark:text-dark-muted uppercase">{item.algo}</span>
                <div className="font-mono text-xs sm:text-sm text-gray-900 dark:text-white break-all select-all">{val}</div>
              </div>
              <CopyButton value={val} className="self-start sm:self-center flex-shrink-0" />
            </div>
          );
        })}

        {hmacKey && hmacResult && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20">
            <div className="min-w-0 space-y-0.5">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase">HMAC-SHA256</span>
              <div className="font-mono text-xs sm:text-sm text-gray-900 dark:text-white break-all select-all">
                {formatHex(hmacResult)}
              </div>
            </div>
            <CopyButton value={formatHex(hmacResult)} className="self-start sm:self-center flex-shrink-0" />
          </div>
        )}
      </div>
    </div>
  );
};

export default HashTool;

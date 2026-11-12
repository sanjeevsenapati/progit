import React, { useState, useMemo, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, Clock, Sparkles, Trash2 } from 'lucide-react';
import { CopyButton, ToolError } from '../components/ToolUI';

// Unsigned sample JWT (not a secret — purely illustrative test payload with alg HS256)
const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlByb0dpdCBEZXZlbG9wZXIiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTk5OTk5OTk5OX0.' +
  'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

function base64UrlToBytes(str: string): Uint8Array {
  let clean = str.replace(/-/g, '+').replace(/_/g, '/');
  clean += '='.repeat((4 - (clean.length % 4)) % 4);
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeBase64UrlJson(part: string): Record<string, unknown> {
  const txt = new TextDecoder().decode(base64UrlToBytes(part));
  return JSON.parse(txt);
}

const HMAC_HASH_MAP: Record<string, 'SHA-256' | 'SHA-384' | 'SHA-512'> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
};

export const JwtTool: React.FC = () => {
  const [token, setToken] = useState(SAMPLE_JWT);
  const [secret, setSecret] = useState('');
  const [sigValid, setSigValid] = useState<'unchecked' | 'valid' | 'invalid' | 'unsupported'>('unchecked');

  const decoded = useMemo(() => {
    const trimmed = token.trim();
    if (!trimmed) return { header: null, payload: null, signature: '', signingInput: '', error: null };
    const parts = trimmed.split('.');
    if (parts.length !== 3) {
      return { header: null, payload: null, signature: '', signingInput: '', error: 'JWT must have exactly 3 dot-separated segments (header.payload.signature).' };
    }
    try {
      const header = decodeBase64UrlJson(parts[0]);
      const payload = decodeBase64UrlJson(parts[1]);
      return {
        header,
        payload,
        signature: parts[2],
        signingInput: `${parts[0]}.${parts[1]}`,
        error: null,
      };
    } catch (err: unknown) {
      return {
        header: null,
        payload: null,
        signature: '',
        signingInput: '',
        error: err instanceof Error ? err.message : 'Unable to decode JWT segments',
      };
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      if (!secret || !decoded.header || !decoded.signature || decoded.error) {
        setSigValid('unchecked');
        return;
      }
      const alg = String(decoded.header.alg || '');
      const hashAlg = HMAC_HASH_MAP[alg];
      if (!hashAlg) {
        setSigValid('unsupported');
        return;
      }
      try {
        const key = await window.crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(secret),
          { name: 'HMAC', hash: hashAlg },
          false,
          ['verify']
        );
        const sigBytes = base64UrlToBytes(decoded.signature);
        const dataBytes = new TextEncoder().encode(decoded.signingInput);
        const ok = await window.crypto.subtle.verify(
          'HMAC',
          key,
          sigBytes.buffer.slice(sigBytes.byteOffset, sigBytes.byteOffset + sigBytes.byteLength) as ArrayBuffer,
          dataBytes
        );
        if (!cancelled) setSigValid(ok ? 'valid' : 'invalid');
      } catch {
        if (!cancelled) setSigValid('invalid');
      }
    };
    verify();
    return () => {
      cancelled = true;
    };
  }, [secret, decoded]);

  const timeClaims = useMemo(() => {
    if (!decoded.payload) return [];
    const keys: Array<{ key: string; label: string }> = [
      { key: 'iat', label: 'Issued At (iat)' },
      { key: 'nbf', label: 'Not Before (nbf)' },
      { key: 'exp', label: 'Expires (exp)' },
    ];
    const nowSec = Math.floor(Date.now() / 1000);
    return keys
      .filter(item => typeof decoded.payload?.[item.key] === 'number')
      .map(item => {
        const ts = Number(decoded.payload?.[item.key]);
        const iso = new Date(ts * 1000).toLocaleString();
        const expired = item.key === 'exp' ? ts < nowSec : false;
        return { ...item, ts, iso, expired };
      });
  }, [decoded.payload]);

  const headerStr = decoded.header ? JSON.stringify(decoded.header, null, 2) : '';
  const payloadStr = decoded.payload ? JSON.stringify(decoded.payload, null, 2) : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-gray-500 dark:text-dark-muted">
          Decoded strictly in-browser — tokens and secrets never leave your machine.
        </span>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => {
              setToken(SAMPLE_JWT);
              setSecret('');
            }}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span>Sample</span>
          </button>
          <button
            type="button"
            onClick={() => setToken('')}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <textarea
        value={token}
        onChange={e => setToken(e.target.value)}
        rows={4}
        spellCheck={false}
        placeholder="Paste JWT (eyJ...)..."
        className="w-full p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500 break-all"
      />

      <ToolError error={decoded.error} />

      {!decoded.error && decoded.payload && (
        <>
          {timeClaims.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {timeClaims.map(c => (
                <div
                  key={c.key}
                  className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs border ${
                    c.expired
                      ? 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                      : 'border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-700 dark:text-dark-text'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span className="font-semibold">{c.label}:</span>
                  <span className="font-mono">{c.iso}</span>
                  {c.key === 'exp' && (
                    <span className={`font-bold ${c.expired ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      ({c.expired ? 'Expired' : 'Active'})
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Header</span>
                <CopyButton value={headerStr} />
              </div>
              <pre className="p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg font-mono text-xs text-gray-900 dark:text-white overflow-x-auto">
                {headerStr}
              </pre>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Payload (Claims)</span>
                <CopyButton value={payloadStr} />
              </div>
              <pre className="p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg font-mono text-xs text-gray-900 dark:text-white overflow-x-auto">
                {payloadStr}
              </pre>
            </div>
          </div>

          {/* Local HMAC Signature Verifier */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-dark-muted">
                Verify Signature ({String(decoded.header?.alg || 'HMAC')})
              </label>
              {sigValid === 'valid' && (
                <span className="inline-flex items-center space-x-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Signature Verified</span>
                </span>
              )}
              {sigValid === 'invalid' && (
                <span className="inline-flex items-center space-x-1 text-xs font-bold text-red-600 dark:text-red-400">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Invalid Signature</span>
                </span>
              )}
              {sigValid === 'unsupported' && (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Local verify supports HS256 / HS384 / HS512.
                </span>
              )}
            </div>
            <input
              type="text"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              placeholder="Enter HMAC secret to verify signature locally..."
              className="w-full px-3.5 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface font-mono text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default JwtTool;

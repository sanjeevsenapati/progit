import React, { useState, useEffect } from 'react';
import { Globe, Loader2, Search, Lock } from 'lucide-react';
import { api, DNSLookupResponse } from '../../../lib/api';
import { useAuth } from '../../../lib/theme';
import { CopyButton, ThemedSelect, ToolError } from '../components/ToolUI';

const RECORD_TYPES = ['ALL', 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR'];

export const DnsTool: React.FC = () => {
  const { user } = useAuth();
  const [name, setName] = useState('example.com');
  const [recordType, setRecordType] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [dnsEnabled, setDnsEnabled] = useState(true);
  const [result, setResult] = useState<DNSLookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getFeatures()
      .then(res => {
        if (res && res.toolbox_dns_enabled !== undefined) {
          setDnsEnabled(res.toolbox_dns_enabled);
        }
      })
      .catch(() => {});
  }, []);

  const runLookup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const target = name.trim();
    if (!target) {
      setError('Enter a domain name or IP address.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.lookupToolboxDNS(target, recordType);
      setResult(data);
    } catch (err: unknown) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'DNS lookup failed');
    } finally {
      setLoading(false);
    }
  };

  if (!dnsEnabled) {
    return (
      <div className="p-5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-800 dark:text-amber-300">
        Server-side DNS lookups are disabled by the administrator (<code>[features] ENABLE_TOOLBOX_DNS = false</code>). All 10 local browser tools remain active.
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start space-x-3">
          <Lock className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">Sign in required for DNS Lookup</p>
            <p className="text-xs text-gray-600 dark:text-dark-muted mt-0.5">
              To prevent anonymous abuse, live DNS queries require an authenticated ProGit session and are rate-limited to 30 req/min.
            </p>
          </div>
        </div>
        <a
          href="/login"
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex-shrink-0"
        >
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={runLookup} className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Globe className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Domain or IP (e.g. github.com, 8.8.8.8)"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <ThemedSelect
          ariaLabel="DNS record type"
          value={recordType}
          onChange={setRecordType}
          buttonClassName="py-2.5 rounded-xl min-w-[8.5rem]"
          menuWidthClass="w-44"
          options={RECORD_TYPES.map(t => ({
            value: t,
            label: t === 'ALL' ? 'ALL Records' : t,
          }))}
        />

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold cursor-pointer transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          <span>Lookup</span>
        </button>
      </form>

      <ToolError error={error} />

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-dark-muted">
            <span>
              Resolved <strong className="font-mono text-gray-900 dark:text-white">{result.name}</strong> ({result.record_type}) —{' '}
              <span className="font-mono">{result.records.length}</span> record(s) in{' '}
              <span className="font-mono">{result.duration_ms} ms</span>
            </span>
            {result.records.length > 0 && (
              <CopyButton
                value={result.records.map(r => `${r.type}\t${r.priority !== undefined ? `${r.priority} ` : ''}${r.value}`).join('\n')}
                label="Copy Records"
              />
            )}
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
            {result.records.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500 dark:text-dark-muted bg-gray-50 dark:bg-dark-bg">
                No {result.record_type} DNS records found for <code>{result.name}</code>.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-dark-border bg-white dark:bg-dark-surface">
                {result.records.map((rec, idx) => (
                  <div key={`${rec.type}-${rec.value}-${idx}`} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
                    <div className="flex items-center space-x-3 min-w-0">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono font-bold text-xs w-16 text-center flex-shrink-0">
                        {rec.type}
                      </span>
                      {rec.priority !== undefined && (
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-bg font-mono text-xs text-gray-500 dark:text-dark-muted flex-shrink-0">
                          prio {rec.priority}
                        </span>
                      )}
                      <code className="font-mono text-gray-900 dark:text-white break-all">{rec.value}</code>
                    </div>
                    <CopyButton value={rec.value} className="flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {result.errors && result.errors.length > 0 && (
            <div className="p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-xs text-gray-500 dark:text-dark-muted space-y-1">
              <p className="font-semibold text-gray-700 dark:text-dark-text">Partial lookup notes:</p>
              {result.errors.map((errMsg, idx) => (
                <div key={idx} className="font-mono">
                  {errMsg}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DnsTool;

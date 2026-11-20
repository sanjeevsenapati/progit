import React, { useMemo, useState } from 'react';
import { AlertCircle, Download, FileText, Filter, Search, Terminal } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';
import { LogSeverity, ParsedLogEntry, parseRawLogs } from '../lib/logAnalysis';

const SAMPLE_LOGS = `2026-11-20T09:00:01.124Z [auth-service] INFO User admin logged in successfully from 192.168.1.50
2026-11-20T09:00:04.281Z [api-gateway] INFO GET /api/v1/repos/sanjeev/progit 200 OK in 14ms
2026-11-20T09:00:07.412Z [git-daemon] WARN High concurrent connections: 84 / 100 limit reached
2026-11-20T09:00:10.590Z [db-pool] ERROR Failed to acquire connection from pool: timeout after 5000ms
    at io.progit.db.HikariPool.getConnection(HikariPool.java:182)
    at io.progit.repo.RepoService.findActive(RepoService.java:64)
2026-11-20T09:00:14.700Z [api-gateway] ERROR POST /api/v1/repos/sanjeev/live-test-repo/forks 500 Internal Server Error
2026-11-20T09:00:18.910Z [keycloak-oidc] INFO Refreshing discovery metadata from http://localhost:8080/realms/progit
2026-11-20T09:00:22.012Z [webhook-worker] WARN Webhook delivery to https://hooks.slack.com timed out after 3 retries
2026-11-20T09:00:25.105Z [auth-service] INFO Token issued for sanjeev_sso with scopes [openid, profile, email]
2026-11-20T09:00:28.320Z [db-pool] INFO Connection pool restored to normal state (active: 12, idle: 8)`;

export const LogAnalyzerTool: React.FC = () => {
  const [rawText, setRawText] = useState<string>(SAMPLE_LOGS);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [activeEntry, setActiveEntry] = useState<ParsedLogEntry | null>(null);

  const parsedEntries = useMemo(() => {
    return parseRawLogs(rawText);
  }, [rawText]);

  const stats = useMemo(() => {
    const counts: Record<LogSeverity, number> = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0 };
    parsedEntries.forEach(e => counts[e.severity]++);
    return counts;
  }, [parsedEntries]);

  const filteredEntries = useMemo(() => {
    return parsedEntries.filter(e => {
      const matchSev = selectedSeverity === 'ALL' || e.severity === selectedSeverity;
      const q = search.toLowerCase();
      const matchQ =
        !q ||
        e.message.toLowerCase().includes(q) ||
        (e.source && e.source.toLowerCase().includes(q)) ||
        (e.timestamp && e.timestamp.toLowerCase().includes(q));
      return matchSev && matchQ;
    });
  }, [parsedEntries, selectedSeverity, search]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (typeof ev.target?.result === 'string') {
        setRawText(ev.target.result);
      }
    };
    reader.readAsText(file);
  };

  const handleExportFiltered = () => {
    const text = filteredEntries.map(e => e.raw).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filtered-logs-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Upload & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs">
          <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 cursor-pointer font-semibold">
            <FileText className="w-3.5 h-3.5 text-emerald-500" />
            <span>Upload .log File</span>
            <input type="file" accept=".log,.txt,.json" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            type="button"
            onClick={handleExportFiltered}
            disabled={filteredEntries.length === 0}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 text-xs font-semibold disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 text-sky-500" />
            <span>Export Filtered ({filteredEntries.length})</span>
          </button>
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search keywords, IPs, messages..."
            className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Severity Filter Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        {[
          { id: 'ALL', label: 'All Logs', count: parsedEntries.length, bg: 'bg-gray-100 text-gray-700 dark:bg-dark-border dark:text-dark-text' },
          { id: 'ERROR', label: 'Errors', count: stats.ERROR, bg: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' },
          { id: 'WARN', label: 'Warnings', count: stats.WARN, bg: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
          { id: 'INFO', label: 'Info', count: stats.INFO, bg: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' },
          { id: 'DEBUG', label: 'Debug', count: stats.DEBUG, bg: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300' },
          { id: 'TRACE', label: 'Trace', count: stats.TRACE, bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
        ].map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedSeverity(item.id)}
            className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
              selectedSeverity === item.id
                ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg'
            }`}
          >
            <span className="text-[11px] block font-semibold text-gray-500 dark:text-dark-muted">{item.label}</span>
            <span className={`text-xs font-mono font-bold mt-1 px-2 py-0.5 rounded inline-block ${item.bg}`}>
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {/* Log Output Table */}
      <div className="border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-bg overflow-hidden text-xs">
        <div className="max-h-[460px] overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border">
          {filteredEntries.map(e => (
            <div
              key={e.id}
              onClick={() => setActiveEntry(e)}
              className={`p-3 font-mono cursor-pointer transition-colors flex items-start space-x-3 ${
                activeEntry?.id === e.id
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                  : 'hover:bg-gray-50 dark:hover:bg-dark-hover'
              }`}
            >
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase ${
                  e.severity === 'ERROR'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                    : e.severity === 'WARN'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                }`}
              >
                {e.severity}
              </span>

              {e.timestamp && (
                <span className="text-gray-400 text-[11px] shrink-0">{e.timestamp}</span>
              )}

              {e.source && (
                <span className="text-indigo-600 dark:text-indigo-400 font-semibold shrink-0">
                  [{e.source}]
                </span>
              )}

              <span className="text-gray-800 dark:text-dark-text break-all line-clamp-2">
                {e.message}
              </span>
            </div>
          ))}

          {filteredEntries.length === 0 && (
            <p className="p-8 text-center text-gray-400">No logs match the selected filter criteria.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LogAnalyzerTool;

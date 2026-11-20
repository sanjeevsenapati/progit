import React, { useMemo, useState } from 'react';
import { AlertCircle, BarChart3, Copy, FileText, Layers, Sparkles } from 'lucide-react';
import { CopyButton } from '../components/ToolUI';
import { LogPatternGroup, extractLogPatterns, parseRawLogs } from '../lib/logAnalysis';

const SAMPLE_LOGS = `2026-11-20T09:01:00.100Z [api] INFO User 1042 authenticated via token
2026-11-20T09:01:00.120Z [api] INFO User 1089 authenticated via token
2026-11-20T09:01:00.150Z [api] INFO User 2004 authenticated via token
2026-11-20T09:01:00.200Z [db] ERROR Connection timeout connecting to 10.0.4.12:5432 after 5000ms
2026-11-20T09:01:00.220Z [db] ERROR Connection timeout connecting to 10.0.4.15:5432 after 5000ms
2026-11-20T09:01:00.250Z [db] ERROR Connection timeout connecting to 10.0.4.18:5432 after 5000ms
2026-11-20T09:01:01.300Z [git] INFO Repository c9823f9b-648b-4b13-8869-7d88e63a1599 clone requested
2026-11-20T09:01:01.340Z [git] INFO Repository 4ba2c900-4b92-4ea5-b442-fca11a7db2e1 clone requested
2026-11-20T09:01:01.400Z [http] WARN Rate limit exceeded for IP 192.168.1.50 (120 req/min)
2026-11-20T09:01:01.450Z [http] WARN Rate limit exceeded for IP 192.168.1.88 (145 req/min)`;

export const LogPatternExtractorTool: React.FC = () => {
  const [rawText, setRawText] = useState<string>(SAMPLE_LOGS);
  const [selectedPattern, setSelectedPattern] = useState<LogPatternGroup | null>(null);

  const parsed = useMemo(() => parseRawLogs(rawText), [rawText]);
  const patterns = useMemo(() => extractLogPatterns(parsed), [parsed]);

  return (
    <div className="space-y-4">
      {/* Description & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-gray-700 dark:text-dark-text flex items-center space-x-1.5 uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            <span>Repeated Log Pattern Extractor</span>
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-dark-muted">
            Automatically clusters log lines by substituting variables with &lt;TIMESTAMP&gt;, &lt;UUID&gt;, &lt;IP&gt;, and &lt;NUM&gt;.
          </p>
        </div>

        <CopyButton
          value={patterns.map(p => `[${p.count}x (${p.percentage}%)] ${p.pattern}`).join('\n')}
          label="Copy Patterns"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Input Textarea */}
        <div className="lg:col-span-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span className="font-semibold uppercase tracking-wider">Raw Log Stream</span>
            <span>{parsed.length} log lines</span>
          </div>
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            rows={18}
            className="w-full font-mono text-xs p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            placeholder="Paste logs here to detect repetitive templates..."
          />
        </div>

        {/* Right: Extracted Pattern Clusters */}
        <div className="lg:col-span-8 space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span className="font-semibold uppercase tracking-wider flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Identified Clusters ({patterns.length})</span>
            </span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
              Sorted by frequency
            </span>
          </div>

          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {patterns.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedPattern(p)}
                className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                  selectedPattern?.id === p.id
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm'
                    : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase ${
                        p.severity === 'ERROR'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          : p.severity === 'WARN'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {p.count} Occurrences
                    </span>
                    <span className="font-mono text-[11px] text-gray-400">{p.percentage}% of stream</span>
                  </div>

                  <span className="text-[10px] text-gray-400 font-mono">{p.id}</span>
                </div>

                {/* Abstracted Template */}
                <div className="font-mono text-[11px] font-semibold text-gray-800 dark:text-dark-text bg-gray-50 dark:bg-dark-border/40 p-2 rounded border border-gray-100 dark:border-dark-border/60 break-all">
                  {p.pattern}
                </div>

                {/* Sample Line */}
                <div className="mt-2 text-[11px] text-gray-500 dark:text-dark-muted flex items-start space-x-1.5">
                  <span className="text-gray-400 shrink-0">Sample:</span>
                  <span className="font-mono truncate">{p.sample}</span>
                </div>
              </div>
            ))}

            {patterns.length === 0 && (
              <p className="p-8 text-center text-xs text-gray-400">No log patterns extracted.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogPatternExtractorTool;

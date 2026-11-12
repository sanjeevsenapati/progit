import React, { useState, useMemo } from 'react';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { CopyButton, ToolError } from '../components/ToolUI';
import { parseCronExpression } from '../lib/cron';

const PRESETS = [
  { label: 'Every 5 min', expr: '*/5 * * * *' },
  { label: 'Hourly', expr: '0 * * * *' },
  { label: 'Daily 02:30', expr: '30 2 * * *' },
  { label: 'Weekdays 09:00', expr: '0 9 * * 1-5' },
  { label: 'Monthly 1st', expr: '0 0 1 * *' },
  { label: 'Spring 6-field (30s)', expr: '*/30 * * * * *' },
];

export const CronTool: React.FC = () => {
  const [expr, setExpr] = useState('*/15 9-18 * * 1-5');
  const [timezone, setTimezone] = useState<'local' | 'utc'>('local');

  const result = useMemo(() => parseCronExpression(expr, timezone, 10), [expr, timezone]);

  const formatDate = (d: Date) =>
    timezone === 'utc'
      ? d.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
      : d.toLocaleString(undefined, {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <button
              key={p.expr}
              type="button"
              onClick={() => setExpr(p.expr)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                expr === p.expr
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-600 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-0.5 text-xs">
          {(['local', 'utc'] as const).map(tz => (
            <button
              key={tz}
              type="button"
              onClick={() => setTimezone(tz)}
              className={`px-3 py-1 rounded-md font-bold uppercase cursor-pointer ${
                timezone === tz
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {tz}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={expr}
          onChange={e => setExpr(e.target.value)}
          spellCheck={false}
          placeholder="e.g. */5 * * * * or 0 */30 9-17 * * MON-FRI"
          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-base sm:text-lg text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
        />
        <CopyButton value={expr} />
      </div>

      <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 text-center text-xs text-gray-500 dark:text-dark-muted font-mono">
        {result.dialect === 'quartz-6' ? (
          <>
            <div className="p-1.5 rounded bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border">sec (0-59)</div>
            <div className="p-1.5 rounded bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border">min (0-59)</div>
            <div className="p-1.5 rounded bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border">hour (0-23)</div>
            <div className="p-1.5 rounded bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border">dom (1-31)</div>
            <div className="p-1.5 rounded bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border">month (1-12)</div>
            <div className="p-1.5 rounded bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border">dow (0-6)</div>
          </>
        ) : (
          <>
            <div className="p-1.5 rounded bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border">min (0-59)</div>
            <div className="p-1.5 rounded bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border">hour (0-23)</div>
            <div className="p-1.5 rounded bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border">dom (1-31)</div>
            <div className="p-1.5 rounded bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border">month (1-12)</div>
            <div className="p-1.5 rounded bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border">dow (0-6)</div>
          </>
        )}
      </div>

      <ToolError error={result.error || null} />

      {result.valid && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                {result.dialect === 'quartz-6' ? 'Quartz / Spring 6-Field Schedule' : 'Linux 5-Field Schedule'}
              </p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                {result.description}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 dark:bg-dark-bg border-b border-gray-200 dark:border-dark-border flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-dark-muted">
              <CalendarClock className="w-4 h-4 text-emerald-500" />
              <span>Next 10 Scheduled Runs ({timezone.toUpperCase()})</span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-dark-border bg-white dark:bg-dark-surface">
              {result.nextRuns.length === 0 ? (
                <div className="p-4 text-xs text-gray-500 dark:text-dark-muted">
                  No matching run found within the next 4 years.
                </div>
              ) : (
                result.nextRuns.map((dt, idx) => (
                  <div key={dt.toISOString()} className="px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-gray-400 font-mono w-6">#{idx + 1}</span>
                    <span className="font-mono text-gray-900 dark:text-white flex-1">{formatDate(dt)}</span>
                    <span className="text-xs text-gray-400 font-mono hidden sm:inline">{dt.toISOString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CronTool;

import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Database, HelpCircle, Layers, Lightbulb, Sparkles } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';

const SAMPLE_QUERIES = {
  join: {
    label: 'Complex Analytics Join & Aggregation',
    sql: `SELECT 
    u.id, 
    u.username, 
    COUNT(r.id) AS total_repos, 
    SUM(r.stars_count) AS total_stars, 
    MAX(r.updated_at) AS last_active
FROM users u
LEFT JOIN repositories r ON r.owner_id = u.id AND r.is_archived = false
WHERE u.is_active = true 
  AND u.created_at >= '2026-01-01'
GROUP BY u.id, u.username
HAVING COUNT(r.id) >= 3
ORDER BY total_stars DESC, u.username ASC
LIMIT 50 OFFSET 0;`,
  },
  antipattern: {
    label: 'Query with Performance Antipatterns',
    sql: `SELECT * 
FROM audit_logs a, users u 
WHERE UPPER(u.email) LIKE '%@gmail.com' 
  AND a.status = 'FAILED'
ORDER BY a.created_at DESC;`,
  },
};

interface ClauseAnalysis {
  name: string;
  order: number;
  content: string;
  explanation: string;
}

interface WarningItem {
  severity: 'high' | 'medium' | 'info';
  title: string;
  desc: string;
  fix: string;
}

export const SqlQueryExplainerTool: React.FC = () => {
  const [sampleKey, setSampleKey] = useState<string>('join');
  const [sql, setSql] = useState<string>(SAMPLE_QUERIES.join.sql);
  const [dialect, setDialect] = useState<string>('postgresql');

  const { clauses, warnings, complexity, summary } = useMemo(() => {
    const raw = sql.trim();
    if (!raw) return { clauses: [], warnings: [], complexity: 'N/A', summary: '' };

    const detectedClauses: ClauseAnalysis[] = [];
    const detectedWarnings: WarningItem[] = [];

    // Parse clauses
    const fromMatch = raw.match(/\bFROM\s+([^;]+?)(?:\bWHERE\b|\bGROUP\b|\bORDER\b|\bLIMIT\b|$)/i);
    const joinMatches = raw.match(/\b(LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN\s+([^\s]+)\s+ON\s+([^;\n]+)/gi);
    const whereMatch = raw.match(/\bWHERE\s+([^;]+?)(?:\bGROUP\b|\bORDER\b|\bLIMIT\b|$)/i);
    const groupMatch = raw.match(/\bGROUP\s+BY\s+([^;]+?)(?:\bHAVING\b|\bORDER\b|\bLIMIT\b|$)/i);
    const havingMatch = raw.match(/\bHAVING\s+([^;]+?)(?:\bORDER\b|\bLIMIT\b|$)/i);
    const selectMatch = raw.match(/\bSELECT\s+(DISTINCT\s+)?([^;]+?)\bFROM\b/i);
    const orderMatch = raw.match(/\bORDER\s+BY\s+([^;]+?)(?:\bLIMIT\b|$)/i);
    const limitMatch = raw.match(/\bLIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);

    if (fromMatch) {
      detectedClauses.push({
        name: 'FROM Clause',
        order: 1,
        content: fromMatch[1].trim(),
        explanation: 'Identifies the base source table and initiates row retrieval pipeline.',
      });
    }

    if (joinMatches) {
      joinMatches.forEach((j, i) => {
        detectedClauses.push({
          name: `JOIN #${i + 1}`,
          order: 2,
          content: j.trim(),
          explanation: 'Correlates secondary table rows on matching foreign key / predicate conditions.',
        });
      });
    }

    if (whereMatch) {
      detectedClauses.push({
        name: 'WHERE Filter',
        order: 3,
        content: whereMatch[1].trim(),
        explanation: 'Filters candidate rows before any grouping or aggregation takes place.',
      });
    }

    if (groupMatch) {
      detectedClauses.push({
        name: 'GROUP BY Clause',
        order: 4,
        content: groupMatch[1].trim(),
        explanation: 'Collapses rows sharing identical key attributes into unified summary groups.',
      });
    }

    if (havingMatch) {
      detectedClauses.push({
        name: 'HAVING Filter',
        order: 5,
        content: havingMatch[1].trim(),
        explanation: 'Post-aggregation filter on grouped calculations (e.g. COUNT > 3).',
      });
    }

    if (selectMatch) {
      detectedClauses.push({
        name: 'SELECT Projection',
        order: 6,
        content: selectMatch[2].trim(),
        explanation: 'Computes target expressions, column aliases, and final output projection schema.',
      });
    }

    if (orderMatch) {
      detectedClauses.push({
        name: 'ORDER BY Sort',
        order: 7,
        content: orderMatch[1].trim(),
        explanation: 'Sorts final results ascending or descending across one or more sort keys.',
      });
    }

    if (limitMatch) {
      detectedClauses.push({
        name: 'LIMIT & OFFSET',
        order: 8,
        content: limitMatch[0].trim(),
        explanation: `Restricts result batch to maximum ${limitMatch[1]} row(s).`,
      });
    }

    // Warnings & Optimization Rules
    if (/\bSELECT\s+\*\b/i.test(raw)) {
      detectedWarnings.push({
        severity: 'medium',
        title: 'Unbounded Wildcard: SELECT *',
        desc: 'Retrieves every column including potential large TEXT or JSON columns, bypassing index-only scans.',
        fix: 'Specify exact required columns (e.g. `SELECT u.id, u.username`).',
      });
    }

    if (/LIKE\s+'%[a-zA-Z0-9]/i.test(raw)) {
      detectedWarnings.push({
        severity: 'high',
        title: 'Non-Sargable Leading Wildcard in LIKE',
        desc: "Using `LIKE '%...'` prevents B-tree index lookup and triggers a full sequential table scan.",
        fix: 'Use exact prefix match `LIKE "term%"`, full-text search (tsvector in PostgreSQL), or trigram indexes.',
      });
    }

    if (/\bUPPER\s*\(|\bLOWER\s*\(|\bDATE\s*\(/i.test(raw)) {
      detectedWarnings.push({
        severity: 'medium',
        title: 'Function Wrapped Predicate in WHERE',
        desc: 'Wrapping columns in functions like `UPPER(col)` disqualifies plain column indexes.',
        fix: 'Create a functional index (e.g. `CREATE INDEX ON users (UPPER(email))`) or use collation.',
      });
    }

    if (/\bFROM\s+([a-zA-Z0-9_-]+)\s*,\s*([a-zA-Z0-9_-]+)/i.test(raw)) {
      detectedWarnings.push({
        severity: 'high',
        title: 'Implicit Cartesian Product (Comma Join)',
        desc: 'Implicit comma joins can accidentally produce full cartesian cross-products (N × M rows).',
        fix: 'Replace comma syntax with explicit `INNER JOIN ... ON ...`.',
      });
    }

    // Determine estimated complexity
    let comp = 'O(N)';
    if (joinMatches && joinMatches.length > 0) comp = 'O(N · log M) with index, or O(N · M) nested loop';
    if (orderMatch && !limitMatch) comp = 'O(N log N) in-memory or disk sort';
    if (limitMatch && !orderMatch) comp = 'O(K) early termination';

    return {
      clauses: detectedClauses.sort((a, b) => a.order - b.order),
      warnings: detectedWarnings,
      complexity: comp,
      summary: `Analyzed ${detectedClauses.length} SQL operational phase(s) with ${detectedWarnings.length} potential optimization hint(s).`,
    };
  }, [sql]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-gray-500">Preset:</span>
          <div className="w-56">
            <ThemedSelect
              value={sampleKey}
              onChange={val => {
                setSampleKey(val);
                if (SAMPLE_QUERIES[val as keyof typeof SAMPLE_QUERIES]) {
                  setSql(SAMPLE_QUERIES[val as keyof typeof SAMPLE_QUERIES].sql);
                }
              }}
              options={Object.entries(SAMPLE_QUERIES).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </div>

          <div className="w-36">
            <ThemedSelect
              value={dialect}
              onChange={setDialect}
              options={[
                { value: 'postgresql', label: 'PostgreSQL' },
                { value: 'mysql', label: 'MySQL / MariaDB' },
                { value: 'sqlite', label: 'SQLite' },
                { value: 'oracle', label: 'Oracle Database' },
              ]}
            />
          </div>
        </div>

        <CopyButton value={sql} label="Copy Query" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: SQL Input */}
        <div className="lg:col-span-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span className="font-semibold uppercase tracking-wider flex items-center space-x-1.5">
              <Database className="w-3.5 h-3.5 text-teal-500" />
              <span>SQL Query Input</span>
            </span>
            <span>{sql.split('\n').length} lines</span>
          </div>
          <textarea
            value={sql}
            onChange={e => setSql(e.target.value)}
            rows={18}
            className="w-full font-mono text-xs p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y leading-relaxed"
            placeholder="SELECT ... FROM ... WHERE ..."
          />
        </div>

        {/* Right: Structural Breakdown & Insights */}
        <div className="lg:col-span-7 space-y-3">
          {/* Complexity & Stats Card */}
          <div className="p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-gray-400 block text-[11px]">Estimated Work Complexity</span>
              <span className="font-mono font-bold text-teal-600 dark:text-teal-400">{complexity}</span>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px]">Optimization Warnings</span>
              <span className={`font-bold ${warnings.length > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                {warnings.length} issue(s) detected
              </span>
            </div>
          </div>

          {/* Warnings List */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.map((w, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 text-xs space-y-1"
                >
                  <div className="flex items-center space-x-1.5 text-amber-800 dark:text-amber-400 font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{w.title}</span>
                  </div>
                  <p className="text-gray-600 dark:text-dark-muted text-[11px]">{w.desc}</p>
                  <div className="flex items-start space-x-1.5 text-emerald-700 dark:text-emerald-400 pt-0.5">
                    <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" />
                    <span className="text-[11px] font-mono">{w.fix}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Logical Execution Order Breakdown */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-2.5">
            <span className="text-xs font-bold text-gray-700 dark:text-dark-text flex items-center space-x-1.5 uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>Logical Query Execution Flow</span>
            </span>

            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {clauses.map((c, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border border-gray-100 dark:border-dark-border/80 bg-gray-50 dark:bg-dark-border/30 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">
                      Step {c.order}: {c.name}
                    </span>
                    <span className="text-[10px] text-gray-400">Phase #{c.order}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-dark-muted">{c.explanation}</p>
                  <div className="font-mono text-[11px] p-1 rounded bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text border border-gray-200 dark:border-dark-border truncate">
                    {c.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SqlQueryExplainerTool;

import React, { useMemo, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Plus, Table, Trash2 } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';

type Alignment = 'left' | 'center' | 'right';

interface TablePreset {
  headers: string[];
  alignments: Alignment[];
  rows: string[][];
}

const PRESETS: Record<string, { label: string; data: TablePreset }> = {
  api: {
    label: 'REST API Endpoints',
    data: {
      headers: ['HTTP Method', 'Endpoint Route', 'Auth Required', 'Description'],
      alignments: ['center', 'left', 'center', 'left'],
      rows: [
        ['GET', '/api/v1/repos', 'Yes', 'List accessible repositories for authenticated user'],
        ['POST', '/api/v1/repos/{owner}/{name}/forks', 'Yes', 'Create a repository fork'],
        ['GET', '/api/v1/admin/oidc/discover', 'Admin', 'Fetch OpenID Connect metadata'],
        ['GET', '/health', 'No', 'Liveness and readiness health probe'],
      ],
    },
  },
  features: {
    label: 'Feature Matrix',
    data: {
      headers: ['Capability', 'Community Edition', 'Enterprise Edition'],
      alignments: ['left', 'center', 'center'],
      rows: [
        ['Git Repositories', 'Unlimited', 'Unlimited'],
        ['OIDC / Keycloak SSO', 'Yes', 'Yes'],
        ['Developer Productivity Suite', '20+ Tools', '20+ Tools'],
        ['SAML 2.0 & Okta', 'No', 'Yes'],
        ['Multi-Region Clustering', 'No', 'Yes'],
      ],
    },
  },
};

export const MarkdownTableTool: React.FC = () => {
  const [headers, setHeaders] = useState<string[]>(PRESETS.api.data.headers);
  const [alignments, setAlignments] = useState<Alignment[]>(PRESETS.api.data.alignments);
  const [rows, setRows] = useState<string[][]>(PRESETS.api.data.rows);
  const [presetKey, setPresetKey] = useState<string>('api');

  const addColumn = () => {
    setHeaders(prev => [...prev, `Column ${prev.length + 1}`]);
    setAlignments(prev => [...prev, 'left']);
    setRows(prev => prev.map(r => [...r, '']));
  };

  const removeColumn = (colIdx: number) => {
    if (headers.length <= 1) return;
    setHeaders(prev => prev.filter((_, i) => i !== colIdx));
    setAlignments(prev => prev.filter((_, i) => i !== colIdx));
    setRows(prev => prev.map(r => r.filter((_, i) => i !== colIdx)));
  };

  const addRow = () => {
    setRows(prev => [...prev, Array(headers.length).fill('')]);
  };

  const removeRow = (rowIdx: number) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, i) => i !== rowIdx));
  };

  const updateHeader = (idx: number, val: string) => {
    setHeaders(prev => prev.map((h, i) => (i === idx ? val : h)));
  };

  const updateCell = (rowIdx: number, colIdx: number, val: string) => {
    setRows(prev =>
      prev.map((r, rIdx) =>
        rIdx === rowIdx ? r.map((c, cIdx) => (cIdx === colIdx ? val : c)) : r
      )
    );
  };

  const toggleAlign = (colIdx: number) => {
    setAlignments(prev =>
      prev.map((a, i) => {
        if (i !== colIdx) return a;
        if (a === 'left') return 'center';
        if (a === 'center') return 'right';
        return 'left';
      })
    );
  };

  // Generate Markdown Table Text
  const markdownText = useMemo(() => {
    if (headers.length === 0) return '';

    // Calculate maximum widths per column for neat formatting
    const colWidths = headers.map((h, colIdx) => {
      let max = Math.max(h.length, 3);
      rows.forEach(r => {
        const cellLen = (r[colIdx] || '').length;
        if (cellLen > max) max = cellLen;
      });
      return max;
    });

    // Header line
    const headerLine =
      '| ' + headers.map((h, i) => h.padEnd(colWidths[i], ' ')).join(' | ') + ' |';

    // Delimiter line
    const delimiterLine =
      '| ' +
      alignments
        .map((a, i) => {
          const w = colWidths[i];
          if (a === 'center') return ':' + '-'.repeat(Math.max(1, w - 2)) + ':';
          if (a === 'right') return '-'.repeat(Math.max(2, w - 1)) + ':';
          return ':' + '-'.repeat(Math.max(2, w - 1));
        })
        .join(' | ') +
      ' |';

    // Body rows
    const bodyLines = rows.map(
      r =>
        '| ' +
        headers
          .map((_, colIdx) => (r[colIdx] || '').padEnd(colWidths[colIdx], ' '))
          .join(' | ') +
        ' |'
    );

    return [headerLine, delimiterLine, ...bodyLines].join('\n');
  }, [headers, alignments, rows]);

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-gray-500">Preset:</span>
          <div className="w-52">
            <ThemedSelect
              value={presetKey}
              onChange={val => {
                setPresetKey(val);
                if (PRESETS[val]) {
                  setHeaders(PRESETS[val].data.headers);
                  setAlignments(PRESETS[val].data.alignments);
                  setRows(PRESETS[val].data.rows);
                }
              }}
              options={Object.entries(PRESETS).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </div>

          <button
            type="button"
            onClick={addColumn}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 font-semibold"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-500" />
            <span>Add Column</span>
          </button>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 font-semibold"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-500" />
            <span>Add Row</span>
          </button>
        </div>

        <CopyButton value={markdownText} label="Copy Markdown Table" />
      </div>

      {/* Spreadsheet Grid */}
      <div className="border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-bg overflow-x-auto text-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-dark-border/40 border-b border-gray-200 dark:border-dark-border">
              {headers.map((h, colIdx) => (
                <th key={colIdx} className="p-2 border-r border-gray-200 dark:border-dark-border min-w-[140px]">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => toggleAlign(colIdx)}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-dark-hover text-gray-500"
                        title={`Alignment: ${alignments[colIdx]}`}
                      >
                        {alignments[colIdx] === 'center' ? (
                          <AlignCenter className="w-3 h-3 text-emerald-500" />
                        ) : alignments[colIdx] === 'right' ? (
                          <AlignRight className="w-3 h-3 text-sky-500" />
                        ) : (
                          <AlignLeft className="w-3 h-3 text-gray-600" />
                        )}
                      </button>

                      {headers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeColumn(colIdx)}
                          className="p-1 rounded text-gray-400 hover:text-red-500"
                          title="Delete Column"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      value={h}
                      onChange={e => updateHeader(colIdx, e.target.value)}
                      className="w-full p-1.5 font-bold rounded border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg"
                    />
                  </div>
                </th>
              ))}
              <th className="w-10 p-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                {headers.map((_, colIdx) => (
                  <td key={colIdx} className="p-1.5 border-r border-gray-100 dark:border-dark-border">
                    <input
                      type="text"
                      value={row[colIdx] || ''}
                      onChange={e => updateCell(rowIdx, colIdx, e.target.value)}
                      className={`w-full p-1.5 rounded border border-transparent hover:border-gray-200 dark:hover:border-dark-border bg-transparent font-mono text-xs ${
                        alignments[colIdx] === 'center'
                          ? 'text-center'
                          : alignments[colIdx] === 'right'
                          ? 'text-right'
                          : 'text-left'
                      }`}
                    />
                  </td>
                ))}
                <td className="p-1 text-center">
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(rowIdx)}
                      className="p-1 text-gray-300 hover:text-red-500 rounded"
                      title="Delete Row"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Generated Markdown Preview */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <span className="font-semibold uppercase tracking-wider">Markdown Table Output</span>
          <span>{rows.length} row(s) × {headers.length} col(s)</span>
        </div>
        <pre className="p-3.5 rounded-xl bg-gray-900 text-emerald-400 font-mono text-xs overflow-x-auto border border-gray-800 leading-relaxed">
          <code>{markdownText}</code>
        </pre>
      </div>
    </div>
  );
};

export default MarkdownTableTool;

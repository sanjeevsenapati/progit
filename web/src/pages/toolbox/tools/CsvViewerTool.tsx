import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Download, FileSpreadsheet, Search, Upload } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';

const SAMPLE_CSV = `id,name,role,email,status,created_at
101,Sanjeev Senapati,Owner,sanjeev@progit.dev,Active,2026-01-15
102,Alex Chen,Senior SRE,alex@progit.dev,Active,2026-02-01
103,Sarah Miller,Core Developer,sarah@progit.dev,Active,2026-02-14
104,DevOps Bot,Service Account,bot@progit.dev,Active,2026-03-01
105,Guest User,Auditor,guest@external.com,Suspended,2026-03-20
106,Elena Rostova,Security Architect,elena@progit.dev,Active,2026-04-05
107,Marcus Vance,Frontend Lead,marcus@progit.dev,Active,2026-04-18
108,CiCd Runner,Automation,runner@internal.net,Active,2026-05-01`;

export const CsvViewerTool: React.FC = () => {
  const [csvText, setCsvText] = useState<string>(SAMPLE_CSV);
  const [delimiter, setDelimiter] = useState<string>('auto');
  const [search, setSearch] = useState<string>('');
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Parse CSV
  const { headers, rows, detectedDelimiter } = useMemo(() => {
    const text = csvText.trim();
    if (!text) return { headers: [], rows: [], detectedDelimiter: ',' };

    let delim = delimiter;
    if (delim === 'auto') {
      const firstLine = text.split('\n')[0] || '';
      const commaCount = (firstLine.match(/,/g) || []).length;
      const semiCount = (firstLine.match(/;/g) || []).length;
      const tabCount = (firstLine.match(/\t/g) || []).length;
      const pipeCount = (firstLine.match(/\|/g) || []).length;

      const max = Math.max(commaCount, semiCount, tabCount, pipeCount);
      if (max === semiCount && semiCount > 0) delim = ';';
      else if (max === tabCount && tabCount > 0) delim = '\t';
      else if (max === pipeCount && pipeCount > 0) delim = '|';
      else delim = ',';
    }

    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [], detectedDelimiter: delim };

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delim && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const hdrs = parseLine(lines[0]);
    const parsedRows = lines.slice(1).map(l => parseLine(l));

    return { headers: hdrs, rows: parsedRows, detectedDelimiter: delim };
  }, [csvText, delimiter]);

  // Filter & Sort
  const filteredRows = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => r.some(cell => cell.toLowerCase().includes(q)));
    }
    if (sortCol !== null && headers[sortCol]) {
      result = [...result].sort((a, b) => {
        const valA = a[sortCol] || '';
        const valB = b[sortCol] || '';
        const numA = Number(valA);
        const numB = Number(valB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return sortAsc ? numA - numB : numB - numA;
        }
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
    }
    return result;
  }, [rows, search, sortCol, sortAsc, headers]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (typeof ev.target?.result === 'string') {
        setCsvText(ev.target.result);
        setPage(1);
      }
    };
    reader.readAsText(file);
  };

  const handleExportJson = () => {
    const jsonArr = filteredRows.map(r => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = r[idx] || '';
      });
      return obj;
    });
    const blob = new Blob([JSON.stringify(jsonArr, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `csv-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(colIdx);
      setSortAsc(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 cursor-pointer font-semibold">
            <Upload className="w-3.5 h-3.5 text-emerald-500" />
            <span>Upload CSV</span>
            <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} className="hidden" />
          </label>

          <div className="w-36">
            <ThemedSelect
              value={delimiter}
              onChange={setDelimiter}
              options={[
                { value: 'auto', label: `Auto (${detectedDelimiter})` },
                { value: ',', label: 'Comma (,)' },
                { value: ';', label: 'Semicolon (;)' },
                { value: '\t', label: 'Tab (\\t)' },
                { value: '|', label: 'Pipe (|)' },
              ]}
            />
          </div>

          <button
            type="button"
            onClick={handleExportJson}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 text-xs font-semibold disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 text-sky-500" />
            <span>Export JSON</span>
          </button>
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search rows..."
            className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Stats Summary */}
      <div className="p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg flex flex-wrap items-center justify-between text-xs text-gray-500">
        <div className="flex items-center space-x-4">
          <span>Rows: <strong className="text-gray-800 dark:text-dark-text">{rows.length}</strong></span>
          <span>Columns: <strong className="text-gray-800 dark:text-dark-text">{headers.length}</strong></span>
          <span>Filtered: <strong className="text-emerald-600 dark:text-emerald-400">{filteredRows.length}</strong></span>
        </div>

        <div className="flex items-center space-x-2">
          <span>Per Page:</span>
          {[10, 25, 50].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setPageSize(s);
                setPage(1);
              }}
              className={`px-2 py-0.5 rounded font-mono ${
                pageSize === s
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-gray-100 dark:bg-dark-border text-gray-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* CSV Grid Table */}
      <div className="border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-bg overflow-x-auto text-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-dark-border/40 border-b border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-text">
              {headers.map((h, i) => (
                <th
                  key={i}
                  onClick={() => toggleSort(i)}
                  className="p-3 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>{h}</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
            {paginatedRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors font-mono">
                {headers.map((_, colIdx) => (
                  <td key={colIdx} className="p-3 text-gray-800 dark:text-dark-text truncate max-w-xs">
                    {row[colIdx] || ''}
                  </td>
                ))}
              </tr>
            ))}
            {paginatedRows.length === 0 && (
              <tr>
                <td colSpan={headers.length || 1} className="p-8 text-center text-gray-400">
                  No CSV records match your search query.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Page {page} of {totalPages}</span>
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1 rounded border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CsvViewerTool;

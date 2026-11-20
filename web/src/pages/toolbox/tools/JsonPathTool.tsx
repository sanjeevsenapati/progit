import React, { useMemo, useState } from 'react';
import { CheckCircle2, Sparkles, Terminal } from 'lucide-react';
import { CopyButton, ThemedSelect, ToolError } from '../components/ToolUI';
import { evaluateJsonPath } from '../lib/jsonpath';

const SAMPLES = {
  store: {
    label: 'Bookstore Catalog',
    path: '$.store.book[?(@.price < 15)].title',
    json: JSON.stringify(
      {
        store: {
          book: [
            { category: 'reference', author: 'Nigel Rees', title: 'Sayings of the Century', price: 8.95 },
            { category: 'fiction', author: 'Evelyn Waugh', title: 'Sword of Honour', price: 12.99 },
            { category: 'fiction', author: 'Herman Melville', title: 'Moby Dick', isbn: '0-553-21311-3', price: 8.99 },
            { category: 'fiction', author: 'J. R. R. Tolkien', title: 'The Lord of the Rings', isbn: '0-395-19395-8', price: 22.99 },
          ],
          bicycle: { color: 'red', price: 19.95 },
        },
      },
      null,
      2
    ),
  },
  k8s: {
    label: 'Kubernetes Pod Spec',
    path: '$.spec.containers[*].image',
    json: JSON.stringify(
      {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: 'progit-server-pod', namespace: 'default' },
        spec: {
          containers: [
            { name: 'progit-app', image: 'ghcr.io/sanjeevsenapati/progit:1.19.0', ports: [{ containerPort: 3000 }] },
            { name: 'keycloak-sidecar', image: 'quay.io/keycloak/keycloak:26.0', ports: [{ containerPort: 8080 }] },
          ],
        },
      },
      null,
      2
    ),
  },
};

export const JsonPathTool: React.FC = () => {
  const [sampleKey, setSampleKey] = useState<string>('store');
  const [inputJson, setInputJson] = useState<string>(SAMPLES.store.json);
  const [pathExpr, setPathExpr] = useState<string>(SAMPLES.store.path);

  const { results, paths, error } = useMemo(() => {
    try {
      const parsed = JSON.parse(inputJson);
      return evaluateJsonPath(parsed, pathExpr);
    } catch (err: any) {
      return { results: [], paths: [], error: 'Invalid JSON: ' + err.message };
    }
  }, [inputJson, pathExpr]);

  const outputFormatted = useMemo(() => {
    return JSON.stringify(results, null, 2);
  }, [results]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs">
          <span className="font-semibold text-gray-500">Preset:</span>
          <div className="w-56">
            <ThemedSelect
              value={sampleKey}
              onChange={val => {
                setSampleKey(val);
                if (SAMPLES[val as keyof typeof SAMPLES]) {
                  setInputJson(SAMPLES[val as keyof typeof SAMPLES].json);
                  setPathExpr(SAMPLES[val as keyof typeof SAMPLES].path);
                }
              }}
              options={Object.entries(SAMPLES).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <CopyButton value={outputFormatted} label="Copy Matches" />
        </div>
      </div>

      {/* JSONPath Input Field */}
      <div className="p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-1.5">
        <label className="text-xs font-bold text-gray-700 dark:text-dark-text flex items-center justify-between">
          <span className="flex items-center space-x-1.5">
            <Terminal className="w-3.5 h-3.5 text-indigo-500" />
            <span>JSONPath Expression</span>
          </span>
          <span className="text-[11px] font-normal text-gray-400">Supports $, .prop, [index], [*], [?(@.field == val)]</span>
        </label>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={pathExpr}
            onChange={e => setPathExpr(e.target.value)}
            placeholder="$.store.book[*].author"
            className="w-full font-mono text-xs p-2 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-emerald-600 dark:text-emerald-400 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Input JSON vs Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Input JSON */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span className="font-semibold uppercase tracking-wider">Input JSON Payload</span>
            <span>{new Blob([inputJson]).size} bytes</span>
          </div>
          <textarea
            value={inputJson}
            onChange={e => setInputJson(e.target.value)}
            rows={16}
            className="w-full font-mono text-xs p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
          />
        </div>

        {/* Right: Evaluated Output */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span className="font-semibold uppercase tracking-wider flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Evaluation Results</span>
            </span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
              {results.length} match(es)
            </span>
          </div>

          <div className="space-y-2">
            {error && <ToolError error={error} />}

            <div className="p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-900 min-h-[340px] max-h-[460px] overflow-auto">
              <pre className="font-mono text-xs text-emerald-400 leading-relaxed">
                <code>{outputFormatted}</code>
              </pre>
            </div>

            {paths.length > 0 && (
              <div className="p-2.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-1">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Matched Paths</span>
                <div className="flex flex-wrap gap-1">
                  {paths.map((p, i) => (
                    <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-border text-gray-700 dark:text-dark-text">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JsonPathTool;

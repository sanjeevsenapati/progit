import React, { useMemo, useState } from 'react';
import { Sparkles, Terminal } from 'lucide-react';
import { CopyButton, ThemedSelect, ToolError } from '../components/ToolUI';
import { evaluateXPath } from '../lib/xpath';

const SAMPLES = {
  books: {
    label: 'Book Inventory XML',
    path: '//book[price < 10]/title',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<bookstore>
  <book category="cooking">
    <title lang="en">Everyday Italian</title>
    <author>Giada De Laurentiis</author>
    <year>2005</year>
    <price>30.00</price>
  </book>
  <book category="children">
    <title lang="en">Harry Potter</title>
    <author>J. K. Rowling</author>
    <year>2005</year>
    <price>29.99</price>
  </book>
  <book category="web">
    <title lang="en">Learning XML</title>
    <author>Erik T. Ray</author>
    <year>2003</year>
    <price>9.95</price>
  </book>
</bookstore>`,
  },
  pom: {
    label: 'Maven pom.xml',
    path: '//dependency[groupId="org.springframework.boot"]/artifactId',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.progit</groupId>
  <artifactId>progit-core</artifactId>
  <version>1.19.0</version>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
      <version>3.2.0</version>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <version>42.7.1</version>
    </dependency>
  </dependencies>
</project>`,
  },
};

export const XPathTool: React.FC = () => {
  const [sampleKey, setSampleKey] = useState<string>('books');
  const [inputXml, setInputXml] = useState<string>(SAMPLES.books.xml);
  const [xpathExpr, setXpathExpr] = useState<string>(SAMPLES.books.path);

  const { matches, count, error } = useMemo(() => {
    return evaluateXPath(inputXml, xpathExpr);
  }, [inputXml, xpathExpr]);

  const outputFormatted = useMemo(() => {
    if (matches.length === 0) return '';
    return matches.map((m, i) => `[${i + 1}] (${m.nodeType}) ${m.path}\n${m.xml}`).join('\n\n');
  }, [matches]);

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
                  setInputXml(SAMPLES[val as keyof typeof SAMPLES].xml);
                  setXpathExpr(SAMPLES[val as keyof typeof SAMPLES].path);
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

      {/* XPath Input */}
      <div className="p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-1.5">
        <label className="text-xs font-bold text-gray-700 dark:text-dark-text flex items-center justify-between">
          <span className="flex items-center space-x-1.5">
            <Terminal className="w-3.5 h-3.5 text-sky-500" />
            <span>XPath 1.0 Expression</span>
          </span>
          <span className="text-[11px] font-normal text-gray-400">Supports //tag, //tag[@attr='val'], text(), count(), etc.</span>
        </label>
        <input
          type="text"
          value={xpathExpr}
          onChange={e => setXpathExpr(e.target.value)}
          placeholder="//book[price<10]/title"
          className="w-full font-mono text-xs p-2 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-sky-600 dark:text-sky-400 font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Input XML */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span className="font-semibold uppercase tracking-wider">Input XML Document</span>
            <span>{new Blob([inputXml]).size} bytes</span>
          </div>
          <textarea
            value={inputXml}
            onChange={e => setInputXml(e.target.value)}
            rows={16}
            className="w-full font-mono text-xs p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
          />
        </div>

        {/* Right: Evaluated Output */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span className="font-semibold uppercase tracking-wider flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Matched XML Nodes</span>
            </span>
            <span className="font-mono text-sky-600 dark:text-sky-400 font-bold">
              {count} match(es)
            </span>
          </div>

          <div className="space-y-2">
            {error && <ToolError error={error} />}

            <div className="p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-900 min-h-[340px] max-h-[460px] overflow-auto">
              {matches.length === 0 ? (
                <p className="text-xs text-gray-500 font-mono">No nodes matching XPath expression.</p>
              ) : (
                <div className="space-y-3 font-mono text-xs text-gray-200">
                  {matches.map((m, idx) => (
                    <div key={idx} className="p-2.5 rounded bg-gray-800/80 border border-gray-700/60 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-sky-400">
                        <span className="font-bold">Match #{idx + 1} ({m.nodeType})</span>
                        <span className="text-gray-400">{m.path}</span>
                      </div>
                      <pre className="text-emerald-300 overflow-x-auto text-[11px] whitespace-pre-wrap">
                        {m.xml}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default XPathTool;

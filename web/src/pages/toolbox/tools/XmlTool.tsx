import React, { useState, useMemo } from 'react';
import { CheckCircle2, Trash2, Sparkles } from 'lucide-react';
import { CopyButton, ToolError } from '../components/ToolUI';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<project><name>progit</name><version>1.6.0</version><features><toolbox enabled="true"/><dns rateLimit="30"/></features></project>`;

function serializePrettyXml(node: Node, indentStr: string, depth: number): string {
  const pad = indentStr.repeat(depth);
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.nodeValue || '').trim();
    return text ? `${pad}${text}\n` : '';
  }
  if (node.nodeType === Node.COMMENT_NODE) {
    return `${pad}<!--${node.nodeValue}-->\n`;
  }
  if (node.nodeType === Node.CDATA_SECTION_NODE) {
    return `${pad}<![CDATA[${node.nodeValue}]]>\n`;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as Element;
  const attrs = Array.from(el.attributes)
    .map(a => ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`)
    .join('');

  const children = Array.from(el.childNodes).filter(
    c => c.nodeType !== Node.TEXT_NODE || (c.nodeValue || '').trim() !== ''
  );

  if (children.length === 0) {
    return `${pad}<${el.tagName}${attrs}/>\n`;
  }

  if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
    return `${pad}<${el.tagName}${attrs}>${(children[0].nodeValue || '').trim()}</${el.tagName}>\n`;
  }

  const inner = children.map(c => serializePrettyXml(c, indentStr, depth + 1)).join('');
  return `${pad}<${el.tagName}${attrs}>\n${inner}${pad}</${el.tagName}>\n`;
}

function serializeMinifyXml(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.nodeValue || '').trim();
  }
  if (node.nodeType === Node.COMMENT_NODE) {
    return '';
  }
  if (node.nodeType === Node.CDATA_SECTION_NODE) {
    return `<![CDATA[${node.nodeValue}]]>`;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const attrs = Array.from(el.attributes)
    .map(a => ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`)
    .join('');
  const inner = Array.from(el.childNodes).map(serializeMinifyXml).join('');
  if (!inner) return `<${el.tagName}${attrs}/>`;
  return `<${el.tagName}${attrs}>${inner}</${el.tagName}>`;
}

export const XmlTool: React.FC = () => {
  const [input, setInput] = useState(SAMPLE_XML);
  const [mode, setMode] = useState<'2' | '4' | 'minify'>('2');

  const { output, error } = useMemo(() => {
    const trimmed = input.trim();
    if (!trimmed) return { output: '', error: null };
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(trimmed, 'application/xml');
      const parseErr = doc.querySelector('parsererror');
      if (parseErr) {
        return { output: '', error: parseErr.textContent?.trim() || 'Invalid XML syntax' };
      }

      const declMatch = trimmed.match(/^<\?xml[^?]*\?>/i);
      const decl = declMatch ? declMatch[0] : '';

      if (mode === 'minify') {
        const body = serializeMinifyXml(doc.documentElement);
        return { output: decl ? `${decl}${body}` : body, error: null };
      }

      const indentStr = mode === '4' ? '    ' : '  ';
      const body = serializePrettyXml(doc.documentElement, indentStr, 0).trimEnd();
      return { output: decl ? `${decl}\n${body}` : body, error: null };
    } catch (err: unknown) {
      return { output: '', error: err instanceof Error ? err.message : 'Failed to parse XML' };
    }
  }, [input, mode]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-0.5 text-xs">
          {[
            { id: '2', label: '2 Spaces' },
            { id: '4', label: '4 Spaces' },
            { id: 'minify', label: 'Minify' },
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id as typeof mode)}
              className={`px-2.5 py-1.5 rounded-md font-bold cursor-pointer transition-colors ${
                mode === opt.id
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setInput(SAMPLE_XML)}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span>Sample</span>
          </button>
          <button
            type="button"
            onClick={() => setInput('')}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
          <CopyButton value={output} />
        </div>
      </div>

      <ToolError error={error} />

      {!error && output && (
        <div className="flex items-center space-x-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Valid XML document</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={15}
          spellCheck={false}
          placeholder="Paste XML here..."
          className="w-full p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg font-mono text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500"
        />
        <textarea
          readOnly
          value={output}
          rows={15}
          spellCheck={false}
          className="w-full p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg font-mono text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none select-all"
        />
      </div>
    </div>
  );
};

export default XmlTool;

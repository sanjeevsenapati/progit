import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content, className = '' }) => {
  if (!content) return null;

  const renderInline = (text: string): React.ReactNode => {
    // Process images: ![alt](url)
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    // Process links: [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    // Process inline code: `code`
    const codeRegex = /`([^`]+)`/g;
    // Process bold: **text** or __text__
    const boldRegex = /(\*\*|__)(.*?)\1/g;
    // Process italic: *text* or _text_
    const italicRegex = /(\*|_)(.*?)\1/g;

    // Tokenize
    let parts: (string | React.ReactNode)[] = [text];

    // Images
    parts = parts.flatMap((part) => {
      if (typeof part !== 'string') return [part];
      const result: (string | React.ReactNode)[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = imgRegex.exec(part)) !== null) {
        if (match.index > lastIndex) {
          result.push(part.substring(lastIndex, match.index));
        }
        result.push(
          <img
            key={`img-${match.index}`}
            src={match[2]}
            alt={match[1]}
            className="max-w-full rounded border border-gray-200 dark:border-dark-border my-2 inline-block"
          />
        );
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < part.length) {
        result.push(part.substring(lastIndex));
      }
      return result;
    });

    // Links
    parts = parts.flatMap((part) => {
      if (typeof part !== 'string') return [part];
      const result: (string | React.ReactNode)[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(part)) !== null) {
        if (match.index > lastIndex) {
          result.push(part.substring(lastIndex, match.index));
        }
        const rawHref = match[2].trim();
        // Defensive URI validation against javascript:, data:, vbscript: XSS
        const isSafeScheme = /^(https?:\/\/|mailto:|#|\/)/i.test(rawHref) || (!rawHref.includes(':') && !rawHref.startsWith('//'));
        const safeHref = isSafeScheme ? rawHref : '#';
        const isExternal = safeHref.startsWith('http://') || safeHref.startsWith('https://');
        result.push(
          <a
            key={`link-${match.index}`}
            href={safeHref}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline inline-flex items-center"
          >
            {match[1]}
          </a>
        );
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < part.length) {
        result.push(part.substring(lastIndex));
      }
      return result;
    });

    // Inline Code
    parts = parts.flatMap((part) => {
      if (typeof part !== 'string') return [part];
      const result: (string | React.ReactNode)[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = codeRegex.exec(part)) !== null) {
        if (match.index > lastIndex) {
          result.push(part.substring(lastIndex, match.index));
        }
        result.push(
          <code
            key={`code-${match.index}`}
            className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-hover font-mono text-xs text-pink-600 dark:text-pink-400 font-semibold"
          >
            {match[1]}
          </code>
        );
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < part.length) {
        result.push(part.substring(lastIndex));
      }
      return result;
    });

    // Bold
    parts = parts.flatMap((part) => {
      if (typeof part !== 'string') return [part];
      const result: (string | React.ReactNode)[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = boldRegex.exec(part)) !== null) {
        if (match.index > lastIndex) {
          result.push(part.substring(lastIndex, match.index));
        }
        result.push(
          <strong key={`bold-${match.index}`} className="font-bold text-gray-900 dark:text-white">
            {match[2]}
          </strong>
        );
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < part.length) {
        result.push(part.substring(lastIndex));
      }
      return result;
    });

    // Italic
    parts = parts.flatMap((part) => {
      if (typeof part !== 'string') return [part];
      const result: (string | React.ReactNode)[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = italicRegex.exec(part)) !== null) {
        if (match.index > lastIndex) {
          result.push(part.substring(lastIndex, match.index));
        }
        result.push(
          <em key={`italic-${match.index}`} className="italic">
            {match[2]}
          </em>
        );
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < part.length) {
        result.push(part.substring(lastIndex));
      }
      return result;
    });

    return parts.map((p, idx) => (React.isValidElement(p) ? p : <React.Fragment key={idx}>{p}</React.Fragment>));
  };

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let tableRows: string[][] = [];

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      if (listType === 'ul') {
        elements.push(
          <ul key={`ul-${elements.length}`} className="list-disc list-inside space-y-1 my-3 pl-2 text-gray-700 dark:text-gray-300">
            {listItems.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {renderInline(item)}
              </li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={`ol-${elements.length}`} className="list-decimal list-inside space-y-1 my-3 pl-2 text-gray-700 dark:text-gray-300">
            {listItems.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {renderInline(item)}
              </li>
            ))}
          </ol>
        );
      }
      listItems = [];
      listType = null;
    }
  };

  const flushTable = () => {
    if (tableRows.length > 0) {
      const headerRow = tableRows[0];
      const bodyRows = tableRows.slice(1).filter((r) => !r.every((c) => /^[-:| ]+$/.test(c)));
      elements.push(
        <div key={`table-${elements.length}`} className="overflow-x-auto my-4 border border-gray-200 dark:border-dark-border rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border text-sm">
            <thead className="bg-gray-50 dark:bg-dark-hover">
              <tr>
                {headerRow.map((col, idx) => (
                  <th key={idx} className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">
                    {renderInline(col.trim())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border/40 bg-white dark:bg-dark-surface">
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-gray-50 dark:hover:bg-dark-hover/40">
                  {row.map((col, cIdx) => (
                    <td key={cIdx} className="px-4 py-2 text-gray-700 dark:text-gray-300">
                      {renderInline(col.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced Code Block
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        const codeText = codeBlockLines.join('\n');
        elements.push(<CodeBlockSnippet key={`code-${elements.length}`} code={codeText} lang={codeBlockLang} />);
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = '';
      } else {
        flushList();
        flushTable();
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Table row: | col1 | col2 |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushList();
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|');
      tableRows.push(cells);
      continue;
    } else {
      flushTable();
    }

    // Unordered List item
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(ulMatch[2]);
      continue;
    }

    // Ordered List item
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (olMatch) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(olMatch[2]);
      continue;
    }

    flushList();

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      elements.push(<hr key={`hr-${elements.length}`} className="my-6 border-gray-200 dark:border-dark-border" />);
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${elements.length}`} className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mt-6 mb-3 pb-2 border-b border-gray-200 dark:border-dark-border">
          {renderInline(line.slice(2))}
        </h1>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${elements.length}`} className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mt-5 mb-2.5 pb-1 border-b border-gray-200 dark:border-dark-border">
          {renderInline(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${elements.length}`} className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mt-4 mb-2">
          {renderInline(line.slice(4))}
        </h3>
      );
      continue;
    }
    if (line.startsWith('#### ')) {
      elements.push(
        <h4 key={`h4-${elements.length}`} className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mt-3 mb-1.5">
          {renderInline(line.slice(5))}
        </h4>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteText = line.replace(/^>\s?/, '');
      elements.push(
        <blockquote
          key={`quote-${elements.length}`}
          className="border-l-4 border-emerald-500 pl-4 py-1.5 my-3 text-gray-600 dark:text-gray-300 italic bg-gray-50/50 dark:bg-dark-hover/30 rounded-r"
        >
          {renderInline(quoteText)}
        </blockquote>
      );
      continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={`empty-${elements.length}`} className="h-3" />);
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${elements.length}`} className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 my-1.5">
        {renderInline(line)}
      </p>
    );
  }

  flushList();
  flushTable();

  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(<CodeBlockSnippet key={`code-end`} code={codeBlockLines.join('\n')} lang={codeBlockLang} />);
  }

  return <div className={`markdown-body space-y-1 ${className}`}>{elements}</div>;
};

const CodeBlockSnippet: React.FC<{ code: string; lang?: string }> = ({ code, lang }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-4 rounded-lg overflow-hidden border border-gray-200 dark:border-dark-border bg-gray-900 text-gray-100 text-xs font-mono shadow-sm">
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-800 border-b border-gray-700 text-gray-400 text-xs">
        <span>{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 text-gray-400 hover:text-white transition-colors"
          title="Copy code"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
};

